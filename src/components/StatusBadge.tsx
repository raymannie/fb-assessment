import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ClockIcon,
  Loader2Icon,
  XCircleIcon,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { TransactionStatus } from '@/types/api'

/** Client-only phases for a transfer that is still being reconciled. */
export type ClientPhase = 'sending' | 'confirming' | 'unconfirmed'

type Variant = TransactionStatus | ClientPhase

/** Text + icon + colour — never colour alone. Colours pass AA on their tinted backgrounds. */
const STATUS: Record<
  Variant,
  { label: string; Icon: typeof CheckCircle2Icon; className: string; spin?: boolean }
> = {
  successful: {
    label: 'Successful',
    Icon: CheckCircle2Icon,
    className:
      'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300',
  },
  pending: {
    label: 'Pending',
    Icon: ClockIcon,
    className:
      'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300',
  },
  failed: {
    label: 'Failed',
    Icon: XCircleIcon,
    className:
      'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300',
  },
  sending: {
    label: 'Sending…',
    Icon: Loader2Icon,
    spin: true,
    className:
      'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300',
  },
  confirming: {
    label: 'Confirming…',
    Icon: Loader2Icon,
    spin: true,
    className:
      'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300',
  },
  unconfirmed: {
    label: 'Unconfirmed',
    Icon: AlertTriangleIcon,
    className:
      'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300',
  },
}

export function StatusBadge({ status, className }: { status: Variant; className?: string }) {
  const { label, Icon, className: tone, spin } = STATUS[status]
  return (
    <Badge variant="outline" className={cn('gap-1 font-medium', tone, className)}>
      <Icon aria-hidden="true" className={cn('size-3.5', spin && 'animate-spin')} />
      {label}
    </Badge>
  )
}
