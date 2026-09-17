import { toast } from 'sonner'

import type { AppDispatch, RootState } from '@/app/store'
import { announce } from '@/features/a11y/announcerSlice'
import { type Effect, reconcile, type ReconcileEvent } from '@/features/send-money/reconciliation'
import { selectSubmission, submissionUpdated } from '@/features/send-money/sendMoneySlice'
import { buildOptimisticRow, transferToTransaction } from '@/features/send-money/transferRows'
import { subtractKobo } from '@/lib/money'
import { backoffDelayMs, sleep } from '@/lib/retry'
import { matchesFilters } from '@/lib/transactionFilters'
import { getMockConfig } from '@/mocks/config'
import { type CreateTransferRequest, type Transfer, transferSchema } from '@/types/api'

import { balanceApi } from './balance'
import { baseApi } from './baseApi'
import { getApiError, isNetworkError, type QueryError } from './errors'
import { transactionsApi } from './transactions'

/**
 * Undo handles for a submission's optimistic patches, keyed by Idempotency-Key. They must
 * outlive the `onQueryStarted` closure because "Check status" from `unresolved` starts a new
 * poll loop that may still need to roll back.
 */
interface PatchCollection {
  undo: () => void
}
const optimisticPatches = new Map<string, PatchCollection[]>()

export const transfersApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    createTransfer: build.mutation<Transfer, { key: string; body: CreateTransferRequest }>({
      query: ({ key, body }) => ({
        url: '/transfers',
        method: 'POST',
        body,
        headers: { 'Idempotency-Key': key },
        // Exceeding this is an UNKNOWN outcome, never a failure (see reconciliation.ts).
        timeout: getMockConfig().clientTransferTimeoutMs,
      }),
      transformResponse: (raw: unknown) => transferSchema.parse(raw),
      // Reconciliation decides what to invalidate; nothing is invalidated blindly.
      invalidatesTags: () => [],
      async onQueryStarted({ key }, api) {
        const getState = () => api.getState() as RootState
        const { dispatch, queryFulfilled } = api
        const submission = selectSubmission(getState())
        if (submission?.idempotencyKey !== key || submission.status !== 'submitting') return

        applyOptimistic(dispatch, getState, key)

        let event: ReconcileEvent
        try {
          const { data } = await queryFulfilled
          event = { type: 'RESPONSE_OK', transfer: data }
        } catch (raised) {
          event = classifyFailure(raised)
        }
        await runReconciliation(dispatch, getState, key, event)
      },
    }),

    getTransferStatus: build.query<Transfer, string>({
      query: (key) => ({ url: `/transfers/${encodeURIComponent(key)}` }),
      // The reconciliation loop is the retry policy here; don't stack the GET retry on top.
      extraOptions: { maxRetries: 0 },
      transformResponse: (raw: unknown) => transferSchema.parse(raw),
    }),
  }),
})

export const { useCreateTransferMutation } = transfersApi

/** 2xx never reaches here. A parsable ApiError body means the server answered "no" → definite. */
function classifyFailure(raised: unknown): ReconcileEvent {
  const error = (raised as { error?: QueryError } | undefined)?.error
  const api = getApiError(error)
  if (api) return { type: 'RESPONSE_DEFINITE', message: api.message, code: api.code }
  const status = error && 'status' in error ? String(error.status) : 'unknown'
  // Network/timeout, or a numeric status without our error shape (e.g. a 502/504 from a
  // gateway): either way we cannot tell whether the debit happened.
  return { type: 'RESPONSE_UNKNOWN', reason: isNetworkError(error) ? status : `http_${status}` }
}

/** T0: decrement the cached balance and insert the pending row into every matching feed cache entry. */
function applyOptimistic(dispatch: AppDispatch, getState: () => RootState, key: string): void {
  const submission = selectSubmission(getState())
  if (!submission) return
  const row = buildOptimisticRow(submission)
  const patches: PatchCollection[] = []

  patches.push(
    dispatch(
      balanceApi.util.updateQueryData('getBalance', undefined, (draft) => {
        draft.available = subtractKobo(draft.available, submission.amount)
      }),
    ),
  )

  for (const args of transactionsApi.util.selectCachedArgsForQuery(getState(), 'getTransactions')) {
    if (!matchesFilters(row, args)) continue
    patches.push(
      dispatch(
        transactionsApi.util.updateQueryData('getTransactions', args, (draft) => {
          const first = draft.pages[0]
          if (first && !first.items.some((t) => t.id === row.id)) first.items.unshift(row)
        }),
      ),
    )
  }
  optimisticPatches.set(key, patches)
}

function undoOptimistic(key: string): void {
  for (const patch of optimisticPatches.get(key) ?? []) patch.undo()
  optimisticPatches.delete(key)
}

/** T1a: replace the optimistic row with the server row wherever it belongs; drop it where it doesn't. */
function commitServerRow(
  dispatch: AppDispatch,
  getState: () => RootState,
  key: string,
  transfer: Transfer,
): void {
  const serverRow = transferToTransaction(transfer)
  const optimisticId = `opt_${key}`
  for (const args of transactionsApi.util.selectCachedArgsForQuery(getState(), 'getTransactions')) {
    dispatch(
      transactionsApi.util.updateQueryData('getTransactions', args, (draft) => {
        for (const page of draft.pages) {
          const index = page.items.findIndex((t) => t.id === optimisticId)
          if (index !== -1) page.items.splice(index, 1)
        }
        const first = draft.pages[0]
        if (
          first &&
          matchesFilters(serverRow, args) &&
          !first.items.some((t) => t.id === serverRow.id)
        ) {
          first.items.unshift(serverRow)
        }
      }),
    )
  }
  // The server row is now the truth; the optimistic patches must never be undone after this.
  optimisticPatches.delete(key)
}

function pollConfig() {
  return {
    baseMs: getMockConfig().pollBaseMs,
    factor: 2,
    maxMs: getMockConfig().pollBaseMs * 8,
    jitter: 0.2,
  }
}

async function pollOnce(dispatch: AppDispatch, key: string): Promise<ReconcileEvent> {
  const result = dispatch(
    transfersApi.endpoints.getTransferStatus.initiate(key, { forceRefetch: true }),
  )
  try {
    const { data, error } = await result
    if (data) return { type: 'POLL_RESULT', transfer: data }
    const api = getApiError(error)
    if (api?.code === 'TRANSFER_NOT_FOUND') return { type: 'POLL_NOT_FOUND' }
    return { type: 'POLL_ERROR', reason: api?.code ?? 'network' }
  } finally {
    result.unsubscribe()
  }
}

/**
 * Drives the pure state machine: apply a transition, execute its effects, and keep polling
 * while it asks for it. Exported so "Check status" can resume from `unresolved`.
 */
export async function runReconciliation(
  dispatch: AppDispatch,
  getState: () => RootState,
  key: string,
  initialEvent: ReconcileEvent,
): Promise<void> {
  let event = initialEvent
  for (;;) {
    const current = selectSubmission(getState())
    if (current?.idempotencyKey !== key) return

    const { submission, effects } = reconcile(current, event)
    dispatch(submissionUpdated(submission))

    let nextAttempt: number | null = null
    for (const effect of effects)
      nextAttempt = executeEffect(dispatch, getState, key, effect) ?? nextAttempt
    if (nextAttempt === null) return

    await sleep(backoffDelayMs(nextAttempt, pollConfig()))
    // The user may have resolved things another way while we slept.
    if (selectSubmission(getState())?.status !== 'confirming') return
    event = await pollOnce(dispatch, key)
  }
}

function executeEffect(
  dispatch: AppDispatch,
  getState: () => RootState,
  key: string,
  effect: Effect,
): number | undefined {
  switch (effect.type) {
    case 'UNDO_OPTIMISTIC':
      undoOptimistic(key)
      return
    case 'COMMIT_SERVER_ROW':
      commitServerRow(dispatch, getState, key, effect.transfer)
      return
    case 'SET_BALANCE':
      dispatch(
        balanceApi.util.updateQueryData('getBalance', undefined, (draft) => {
          draft.available = effect.available
        }),
      )
      return
    case 'INVALIDATE_BALANCE':
      dispatch(baseApi.util.invalidateTags(['Balance']))
      return
    case 'ANNOUNCE':
      dispatch(announce({ politeness: effect.politeness, message: effect.message }))
      return
    case 'TOAST':
      if (effect.kind === 'success') toast.success(effect.message)
      else toast.error(effect.message)
      return
    case 'SCHEDULE_POLL':
      return effect.attempt
  }
}

/** "Check status" from the unresolved state. */
export function checkTransferStatus(key: string) {
  return (dispatch: AppDispatch, getState: () => RootState) =>
    runReconciliation(dispatch, getState, key, { type: 'CHECK_STATUS' })
}
