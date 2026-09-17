import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import type { Kobo } from '@/lib/money'

import { transferFingerprint } from './fingerprint'
import { isActive, isLocked, type Submission } from './reconciliation'

export type SendMoneyStep = 'recipient' | 'amount' | 'review' | 'confirm'
export const STEPS: readonly SendMoneyStep[] = ['recipient', 'amount', 'review', 'confirm']

export interface ResolvedRecipient {
  accountNumber: string
  accountNumberMasked: string
  bankCode: string
  bankName: string
  accountName: string
}

export interface SendMoneyDraft {
  recipient: ResolvedRecipient | null
  amountInput: string
  amountKobo: Kobo | null
  narration: string
}

export interface SendMoneyState {
  open: boolean
  step: SendMoneyStep
  draft: SendMoneyDraft
  /** Generated on entering Review; bound to `fingerprint`. Never persisted. */
  idempotencyKey: string | null
  fingerprint: string | null
  submission: Submission | null
}

const emptyDraft: SendMoneyDraft = {
  recipient: null,
  amountInput: '',
  amountKobo: null,
  narration: '',
}

export const initialSendMoneyState: SendMoneyState = {
  open: false,
  step: 'recipient',
  draft: emptyDraft,
  idempotencyKey: null,
  fingerprint: null,
  submission: null,
}

function draftFingerprint(draft: SendMoneyDraft): string | null {
  if (!draft.recipient || draft.amountKobo === null) return null
  return transferFingerprint({
    accountNumber: draft.recipient.accountNumber,
    bankCode: draft.recipient.bankCode,
    amount: draft.amountKobo,
    narration: draft.narration,
  })
}

/**
 * Client state for the Send Money flow. Lives in the main bundle (it is tiny) because the
 * shell needs `submission` for the "confirming" lock after the lazy dialog has been closed.
 */
export const sendMoneySlice = createSlice({
  name: 'sendMoney',
  initialState: initialSendMoneyState,
  reducers: {
    openDialog(state) {
      state.open = true
      // A finished transfer is a receipt; opening again starts a fresh draft.
      if (state.submission?.status === 'succeeded') resetDraft(state)
    },
    closeDialog(state) {
      state.open = false
    },
    goToStep(state, action: PayloadAction<SendMoneyStep>) {
      state.step = action.payload
    },
    setRecipient(state, action: PayloadAction<ResolvedRecipient>) {
      state.draft.recipient = action.payload
    },
    setAmount(state, action: PayloadAction<{ input: string; kobo: Kobo | null }>) {
      state.draft.amountInput = action.payload.input
      state.draft.amountKobo = action.payload.kobo
    },
    setNarration(state, action: PayloadAction<string>) {
      state.draft.narration = action.payload
    },
    /**
     * Called on entering Review. Reuses the key when the payload fingerprint is unchanged
     * (so a retry after Back → Next is still the same transfer) and rotates it otherwise.
     */
    ensureIdempotencyKey: {
      reducer(state, action: PayloadAction<{ candidateKey: string }>) {
        const fingerprint = draftFingerprint(state.draft)
        if (fingerprint === null) return
        if (state.idempotencyKey && state.fingerprint === fingerprint) return
        state.idempotencyKey = action.payload.candidateKey
        state.fingerprint = fingerprint
      },
      prepare(candidateKey: string = crypto.randomUUID()) {
        return { payload: { candidateKey } }
      },
    },
    /** Guarded: ignored while a submission is active (double-click / double-submit safety). */
    submissionStarted(state, action: PayloadAction<Submission>) {
      if (isActive(state.submission)) return
      state.submission = action.payload
    },
    submissionUpdated(state, action: PayloadAction<Submission>) {
      if (state.submission?.idempotencyKey !== action.payload.idempotencyKey) return
      state.submission = action.payload
    },
    /** From `failed`: keep the draft, drop the failed record, go back to fix things. */
    editAfterFailure(state) {
      if (state.submission?.status !== 'failed') return
      state.submission = null
      state.step = 'amount'
    },
    /** From `succeeded`: everything fresh, including the key. */
    resetAfterSuccess(state) {
      if (state.submission && state.submission.status !== 'succeeded') return
      resetDraft(state)
    },
  },
  selectors: {
    selectSendMoneyOpen: (state) => state.open,
    selectStep: (state) => state.step,
    selectDraft: (state) => state.draft,
    selectIdempotencyKey: (state) => state.idempotencyKey,
    selectSubmission: (state) => state.submission,
    selectIsActive: (state) => isActive(state.submission),
    selectIsLocked: (state) => isLocked(state.submission),
  },
})

function resetDraft(state: SendMoneyState) {
  state.step = 'recipient'
  state.draft = emptyDraft
  state.idempotencyKey = null
  state.fingerprint = null
  state.submission = null
}

export const {
  openDialog,
  closeDialog,
  goToStep,
  setRecipient,
  setAmount,
  setNarration,
  ensureIdempotencyKey,
  submissionStarted,
  submissionUpdated,
  editAfterFailure,
  resetAfterSuccess,
} = sendMoneySlice.actions

export const {
  selectSendMoneyOpen,
  selectStep,
  selectDraft,
  selectIdempotencyKey,
  selectSubmission,
  selectIsActive,
  selectIsLocked,
} = sendMoneySlice.selectors
