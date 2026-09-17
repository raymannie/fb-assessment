import { useEffect } from 'react'

import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { Money } from '@/components/Money'
import { Button } from '@/components/ui/button'
import { sanitizeText } from '@/lib/sanitize'

import { ensureIdempotencyKey, goToStep, selectDraft } from '../sendMoneySlice'

export function ReviewStep() {
  const dispatch = useAppDispatch()
  const draft = useAppSelector(selectDraft)

  // The Idempotency-Key is minted here and bound to this exact payload.
  useEffect(() => {
    dispatch(ensureIdempotencyKey())
  }, [dispatch])

  if (!draft.recipient || draft.amountKobo === null) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm">Some details are missing.</p>
        <Button type="button" onClick={() => dispatch(goToStep('recipient'))}>
          Start again
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <dl className="divide-y rounded-lg border text-sm">
        <div className="flex items-start justify-between gap-3 p-3">
          <dt className="text-muted-foreground">Recipient</dt>
          <dd className="text-right">
            <div className="font-medium">
              {sanitizeText(draft.recipient.accountName, { maxLength: 80 })}
            </div>
            <div className="text-muted-foreground text-xs">
              {draft.recipient.accountNumberMasked} · {draft.recipient.bankName}
            </div>
            <Button
              type="button"
              variant="link"
              size="xs"
              className="h-auto p-0"
              onClick={() => dispatch(goToStep('recipient'))}
            >
              Edit recipient
            </Button>
          </dd>
        </div>
        <div className="flex items-start justify-between gap-3 p-3">
          <dt className="text-muted-foreground">Amount</dt>
          <dd className="text-right">
            <div className="text-lg font-semibold">
              <Money kobo={draft.amountKobo} />
            </div>
            <Button
              type="button"
              variant="link"
              size="xs"
              className="h-auto p-0"
              onClick={() => dispatch(goToStep('amount'))}
            >
              Edit amount
            </Button>
          </dd>
        </div>
        <div className="flex items-start justify-between gap-3 p-3">
          <dt className="text-muted-foreground">Narration</dt>
          <dd className="text-right">
            {draft.narration.trim() ? (
              sanitizeText(draft.narration)
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </dd>
        </div>
      </dl>

      <div className="flex justify-between gap-2 pt-2">
        <Button type="button" variant="outline" onClick={() => dispatch(goToStep('amount'))}>
          Back
        </Button>
        <Button type="button" onClick={() => dispatch(goToStep('confirm'))}>
          Continue
        </Button>
      </div>
    </div>
  )
}
