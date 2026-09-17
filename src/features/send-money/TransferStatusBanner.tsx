import { Loader2Icon, AlertTriangleIcon } from 'lucide-react'

import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { Money } from '@/components/Money'
import { Button } from '@/components/ui/button'

import { openDialog, selectSubmission } from './sendMoneySlice'

/** Shown in the shell while a transfer's outcome is unknown, even after the dialog is closed. */
export function TransferStatusBanner() {
  const submission = useAppSelector(selectSubmission)
  const dispatch = useAppDispatch()
  if (!submission || (submission.status !== 'confirming' && submission.status !== 'unresolved'))
    return null

  const unresolved = submission.status === 'unresolved'
  return (
    <div
      className="border-b border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
      data-testid="transfer-status-banner"
    >
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2 text-sm">
        {unresolved ? (
          <AlertTriangleIcon aria-hidden="true" className="size-4 shrink-0" />
        ) : (
          <Loader2Icon aria-hidden="true" className="size-4 shrink-0 animate-spin" />
        )}
        <p className="min-w-0 flex-1">
          {unresolved ? 'Couldn’t confirm' : 'Confirming'} your transfer of{' '}
          <Money kobo={submission.amount} /> to {submission.recipient.accountName}. Don’t send it
          again.
        </p>
        <Button type="button" size="sm" variant="outline" onClick={() => dispatch(openDialog())}>
          View
        </Button>
      </div>
    </div>
  )
}
