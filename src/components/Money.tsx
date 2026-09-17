import { formatNaira, type Kobo, type SignDisplay } from '@/lib/money'
import { cn } from '@/lib/utils'

interface MoneyProps {
  kobo: Kobo
  signDisplay?: SignDisplay
  className?: string
}

/** The only component that renders money. Tabular figures so columns line up. */
export function Money({ kobo, signDisplay = 'auto', className }: MoneyProps) {
  return <span className={cn('tabular-nums', className)}>{formatNaira(kobo, { signDisplay })}</span>
}
