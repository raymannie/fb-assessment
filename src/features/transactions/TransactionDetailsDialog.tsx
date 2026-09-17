import { useMemo } from 'react'

import { getApiError, getErrorMessage } from '@/api/errors'
import { useGetTransactionQuery } from '@/api/transactions'
import { AsyncState } from '@/components/AsyncState'
import { Money } from '@/components/Money'
import { type ClientPhase, StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { formatLagosDateTime } from '@/lib/date'
import { subtractKobo, ZERO_KOBO } from '@/lib/money'
import { restoreOpenerFocus } from '@/lib/returnFocus'
import { sanitizeText } from '@/lib/sanitize'
import type { Transaction } from '@/types/api'

interface TransactionDetailsDialogProps {
  id: string | null
  /** The row if the feed already has it (covers optimistic rows, which the server doesn't know). */
  cached: Transaction | undefined
  phase?: ClientPhase | undefined
  onClose: () => void
}

/** Full detail is allowed more text than a feed row, still sanitized and capped. */
const DETAIL_TEXT = { maxLength: 500 }

export function TransactionDetailsDialog({
  id,
  cached,
  phase,
  onClose,
}: TransactionDetailsDialogProps) {
  const isOptimistic = id?.startsWith('opt_') ?? false
  const { data, isLoading, isError, error, refetch, isFetching } = useGetTransactionQuery(
    id ?? '',
    {
      skip: id === null || cached !== undefined || isOptimistic,
    },
  )
  const transaction = cached ?? data
  const notFound = getApiError(error)?.code === 'TRANSACTION_NOT_FOUND'

  const rows = useMemo(() => {
    if (!transaction) return []
    return [
      ['Description', sanitizeText(transaction.description, DETAIL_TEXT)],
      [
        transaction.type === 'credit' ? 'From' : 'To',
        sanitizeText(transaction.counterparty.name, DETAIL_TEXT),
      ],
      ['Account', transaction.counterparty.accountNumberMasked],
      ['Bank', sanitizeText(transaction.counterparty.bankName, DETAIL_TEXT)],
      ['Date', formatLagosDateTime(transaction.createdAt)],
      [
        'Reference',
        transaction.reference === 'PENDING'
          ? 'Assigned once the bank confirms'
          : transaction.reference,
      ],
      ['Transaction ID', isOptimistic ? 'Pending' : transaction.id],
    ] as const
  }, [transaction, isOptimistic])

  return (
    <Dialog open={id !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        onCloseAutoFocus={restoreOpenerFocus}
        className="max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-h-[92dvh] max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:overflow-y-auto max-sm:rounded-t-2xl max-sm:rounded-b-none max-sm:pb-[max(1rem,env(safe-area-inset-bottom))] sm:max-w-md"
        data-testid="transaction-details"
      >
        <AsyncState
          isLoading={isLoading}
          isError={isError && !transaction}
          errorMessage={
            notFound
              ? 'This transaction doesn’t exist or is no longer available.'
              : getErrorMessage(error)
          }
          onRetry={notFound ? undefined : () => void refetch()}
          retrying={isFetching}
          loadingLabel="Loading transaction"
          skeleton={
            <div className="space-y-3">
              <DialogTitle className="sr-only">Transaction details</DialogTitle>
              <DialogDescription className="sr-only">Loading</DialogDescription>
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-40 w-full" />
            </div>
          }
        >
          {transaction && (
            <div className="flex flex-col gap-4">
              <div>
                <DialogDescription className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                  {transaction.type === 'credit' ? 'Money in' : 'Money out'}
                </DialogDescription>
                <DialogTitle className="text-2xl font-semibold tracking-tight">
                  <Money
                    kobo={
                      transaction.type === 'debit'
                        ? subtractKobo(ZERO_KOBO, transaction.amount)
                        : transaction.amount
                    }
                    signDisplay="always"
                    className={
                      transaction.type === 'credit' ? 'text-emerald-800 dark:text-emerald-300' : ''
                    }
                  />
                </DialogTitle>
                <div className="mt-2">
                  <StatusBadge status={phase ?? transaction.status} />
                </div>
              </div>

              <dl className="divide-y rounded-lg border text-sm">
                {rows.map(([label, value]) => (
                  <div key={label} className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 p-3">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="min-w-0 break-words">{value}</dd>
                  </div>
                ))}
              </dl>

              <div className="flex justify-end">
                <Button type="button" variant="outline" onClick={onClose}>
                  Close
                </Button>
              </div>
            </div>
          )}
          {isError && !transaction && (
            <div className="flex justify-end">
              <Button type="button" variant="outline" onClick={onClose}>
                Close
              </Button>
            </div>
          )}
        </AsyncState>
      </DialogContent>
    </Dialog>
  )
}
