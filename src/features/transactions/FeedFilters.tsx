import { XIcon } from 'lucide-react'
import { useId } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import type { TransactionFilters } from '@/types/api'

import { countActiveFilters } from './filterModel'

interface FeedFiltersProps {
  filters: TransactionFilters
  onChange: (patch: Partial<TransactionFilters>) => void
  onClear: () => void
}

/**
 * Native date inputs and selects on purpose: they get the OS picker on Android, need no
 * JavaScript for keyboard/screen-reader support, and cost nothing in bundle size.
 */
export function FeedFilters({ filters, onChange, onClear }: FeedFiltersProps) {
  const id = useId()
  const active = countActiveFilters(filters)

  return (
    <fieldset className="grid grid-cols-2 gap-3 md:grid-cols-[1fr_1fr_1fr_1fr_auto] md:items-end">
      <legend className="sr-only">Filter transactions</legend>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-from`}>From</Label>
        <Input
          id={`${id}-from`}
          type="date"
          value={filters.from ?? ''}
          max={filters.to}
          onChange={(e) => onChange({ from: e.target.value || undefined })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-to`}>To</Label>
        <Input
          id={`${id}-to`}
          type="date"
          value={filters.to ?? ''}
          min={filters.from}
          onChange={(e) => onChange({ to: e.target.value || undefined })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-status`}>Status</Label>
        <NativeSelect
          id={`${id}-status`}
          value={filters.status ?? ''}
          onChange={(e) =>
            onChange({ status: (e.target.value || undefined) as TransactionFilters['status'] })
          }
        >
          <option value="">All statuses</option>
          <option value="successful">Successful</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
        </NativeSelect>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-type`}>Type</Label>
        <NativeSelect
          id={`${id}-type`}
          value={filters.type ?? ''}
          onChange={(e) =>
            onChange({ type: (e.target.value || undefined) as TransactionFilters['type'] })
          }
        >
          <option value="">All types</option>
          <option value="credit">Credit</option>
          <option value="debit">Debit</option>
        </NativeSelect>
      </div>
      <div className="col-span-2 md:col-span-1">
        <Button
          type="button"
          variant="outline"
          onClick={onClear}
          disabled={active === 0}
          className="w-full md:w-auto"
        >
          <XIcon aria-hidden="true" />
          Clear filters{active > 0 && ` (${active})`}
        </Button>
      </div>
    </fieldset>
  )
}
