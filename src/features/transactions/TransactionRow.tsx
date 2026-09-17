import { memo } from 'react'

import { Money } from '@/components/Money'
import { type ClientPhase, StatusBadge } from '@/components/StatusBadge'
import { formatLagosDateTime } from '@/lib/date'
import { type Kobo, subtractKobo, ZERO_KOBO } from '@/lib/money'
import { sanitizeText } from '@/lib/sanitize'
import type { TransactionStatus, TransactionType } from '@/types/api'

export interface TransactionRowProps {
  description: string
  counterpartyName: string
  accountNumberMasked: string
  bankName: string
  amount: Kobo
  type: TransactionType
  status: TransactionStatus
  createdAt: string
  /** Set only for the row of an in-flight Send Money submission. */
  phase?: ClientPhase | undefined
}

/**
 * Pure, memoized on primitive props: a refetch that returns equal values (new object
 * identities) re-renders nothing here. All untrusted text goes through sanitizeText and is
 * rendered as a text node only.
 *
 * Layout: a 2-column card on mobile (description/amount, counterparty/status, time),
 * a 4-column row from `md` up (time, description, status, amount).
 */
export const TransactionRow = memo(function TransactionRow({
  description,
  counterpartyName,
  accountNumberMasked,
  bankName,
  amount,
  type,
  status,
  createdAt,
  phase,
}: TransactionRowProps) {
  const signed = type === 'debit' ? subtractKobo(ZERO_KOBO, amount) : amount
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-b px-1 py-3 md:grid-cols-[9.5rem_minmax(0,1fr)_7.5rem_9rem] md:items-center md:gap-y-0">
      <time
        dateTime={createdAt}
        className="text-muted-foreground col-span-2 row-start-3 text-xs md:col-span-1 md:col-start-1 md:row-start-1 md:text-sm"
      >
        {formatLagosDateTime(createdAt)}
      </time>
      <div className="col-start-1 row-span-2 row-start-1 min-w-0 md:col-start-2 md:row-span-1">
        <p className="truncate font-medium" title={sanitizeText(description)}>
          {sanitizeText(description)}
        </p>
        <p className="text-muted-foreground truncate text-xs">
          {sanitizeText(counterpartyName, { maxLength: 60 })} · {accountNumberMasked} ·{' '}
          {sanitizeText(bankName, { maxLength: 40 })}
        </p>
      </div>
      <div className="col-start-2 row-start-2 justify-self-end md:col-start-3 md:row-start-1 md:justify-self-start">
        <StatusBadge status={phase ?? status} />
      </div>
      <Money
        kobo={signed}
        signDisplay="always"
        className={`col-start-2 row-start-1 justify-self-end font-semibold md:col-start-4 ${
          type === 'credit' ? 'text-emerald-800 dark:text-emerald-300' : ''
        }`}
      />
    </div>
  )
})
