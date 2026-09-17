import { AlertCircleIcon, AlertTriangleIcon, CheckCircle2Icon, Loader2Icon } from 'lucide-react'

import { checkTransferStatus, useCreateTransferMutation } from '@/api/transfers'
import { useAppDispatch, useAppSelector, useAppStore } from '@/app/hooks'
import { announce } from '@/features/a11y/announcerSlice'
import { useOnlineStatus } from '@/features/connectivity/useOnlineStatus'
import { Money } from '@/components/Money'
import { Button } from '@/components/ui/button'
import { formatNaira } from '@/lib/money'
import { sanitizeText } from '@/lib/sanitize'

import { isActive, MAX_POLL_ATTEMPTS, type Submission } from '../reconciliation'
import {
  closeDialog,
  editAfterFailure,
  goToStep,
  resetAfterSuccess,
  selectDraft,
  selectIdempotencyKey,
  selectSubmission,
  submissionStarted,
} from '../sendMoneySlice'

export function ConfirmStep() {
  const dispatch = useAppDispatch()
  const store = useAppStore()
  const draft = useAppSelector(selectDraft)
  const idempotencyKey = useAppSelector(selectIdempotencyKey)
  const submission = useAppSelector(selectSubmission)
  const [createTransfer] = useCreateTransferMutation()

  const online = useOnlineStatus()
  const active = isActive(submission)
  const canSend =
    !!draft.recipient && draft.amountKobo !== null && !!idempotencyKey && !active && online

  const send = () => {
    // Read the store synchronously: a second click in the same tick sees `submitting` and stops.
    const state = store.getState()
    if (isActive(selectSubmission(state)) || !navigator.onLine) return
    const current = selectDraft(state)
    const key = selectIdempotencyKey(state)
    if (!current.recipient || current.amountKobo === null || !key) return

    const narration = current.narration.trim()
    const record: Submission = {
      idempotencyKey: key,
      optimisticRowId: `opt_${key}`,
      amount: current.amountKobo,
      recipient: {
        accountName: current.recipient.accountName,
        accountNumberMasked: current.recipient.accountNumberMasked,
        bankCode: current.recipient.bankCode,
        bankName: current.recipient.bankName,
      },
      ...(narration ? { narration } : {}),
      status: 'submitting',
      pollAttempt: 0,
      startedAt: new Date().toISOString(),
    }
    dispatch(submissionStarted(record))
    dispatch(
      announce({
        politeness: 'polite',
        message: `Sending ${formatNaira(current.amountKobo)} to ${current.recipient.accountName}…`,
      }),
    )
    void createTransfer({
      key,
      body: {
        recipient: {
          accountNumber: current.recipient.accountNumber,
          bankCode: current.recipient.bankCode,
          accountName: current.recipient.accountName,
        },
        amount: current.amountKobo,
        ...(narration ? { narration } : {}),
      },
    })
  }

  if (!draft.recipient || draft.amountKobo === null) {
    return (
      <Button type="button" onClick={() => dispatch(goToStep('recipient'))}>
        Start again
      </Button>
    )
  }

  const summary = (
    <p className="text-sm">
      Send <Money kobo={draft.amountKobo} className="font-semibold" /> to{' '}
      <span className="font-semibold">
        {sanitizeText(draft.recipient.accountName, { maxLength: 80 })}
      </span>{' '}
      · {draft.recipient.accountNumberMasked} · {draft.recipient.bankName}
    </p>
  )

  return (
    <div className="flex flex-col gap-4">
      {summary}

      {(!submission || submission.status === 'submitting') && (
        <div className="flex justify-between gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            disabled={active}
            onClick={() => dispatch(goToStep('review'))}
          >
            Back
          </Button>
          <Button type="button" onClick={send} disabled={!canSend} aria-disabled={!canSend}>
            {submission?.status === 'submitting' ? (
              <>
                <Loader2Icon aria-hidden="true" className="animate-spin" />
                Sending…
              </>
            ) : (
              'Confirm and send'
            )}
          </Button>
        </div>
      )}

      {submission?.status === 'succeeded' && submission.transfer && (
        <div
          className="flex flex-col gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
          data-testid="transfer-succeeded"
        >
          <p className="flex items-center gap-2 font-semibold">
            <CheckCircle2Icon aria-hidden="true" className="size-5" />
            Transfer sent
          </p>
          <p className="text-sm">Reference {submission.transfer.reference}</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => dispatch(resetAfterSuccess())}>
              Send another
            </Button>
            <Button
              type="button"
              onClick={() => {
                dispatch(closeDialog())
                dispatch(resetAfterSuccess())
              }}
            >
              Done
            </Button>
          </div>
        </div>
      )}

      {submission?.status === 'failed' && (
        <div
          className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100"
          data-testid="transfer-failed"
        >
          <p className="flex items-center gap-2 font-semibold">
            <AlertCircleIcon aria-hidden="true" className="size-5" />
            Transfer failed
          </p>
          <p className="text-sm">{submission.error?.message}</p>
          <p className="text-sm">Nothing was debited.</p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => dispatch(editAfterFailure())}>
              Edit details
            </Button>
            {submission.error?.retryable && (
              <Button type="button" onClick={send} disabled={!online}>
                Retry
              </Button>
            )}
          </div>
        </div>
      )}

      {submission?.status === 'confirming' && (
        <div
          className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
          data-testid="transfer-confirming"
        >
          <p className="flex items-center gap-2 font-semibold">
            <Loader2Icon aria-hidden="true" className="size-5 animate-spin" />
            Confirming with the bank…
          </p>
          <p className="text-sm">
            We didn’t get a reply in time, so we’re checking whether the money moved. Don’t send it
            again. Attempt {Math.min(submission.pollAttempt + 1, MAX_POLL_ATTEMPTS)} of{' '}
            {MAX_POLL_ATTEMPTS}.
          </p>
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={() => dispatch(closeDialog())}>
              Close and keep checking
            </Button>
          </div>
        </div>
      )}

      {submission?.status === 'unresolved' && (
        <div
          className="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
          data-testid="transfer-unresolved"
        >
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangleIcon aria-hidden="true" className="size-5" />
            We couldn’t confirm this transfer
          </p>
          <p className="text-sm">
            The bank hasn’t told us whether it went through. Don’t send it again — check again in a
            moment.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => dispatch(closeDialog())}>
              Close
            </Button>
            <Button
              type="button"
              onClick={() => void dispatch(checkTransferStatus(submission.idempotencyKey))}
            >
              Check status
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
