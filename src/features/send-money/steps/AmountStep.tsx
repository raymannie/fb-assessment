import { zodResolver } from '@hookform/resolvers/zod'
import { useId, useMemo } from 'react'
import { useForm } from 'react-hook-form'

import { useGetBalanceQuery } from '@/api/balance'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { Money } from '@/components/Money'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { parseNairaInputToKobo } from '@/lib/money'
import { NARRATION_MAX_LENGTH } from '@/types/api'

import { type AmountForm, makeAmountSchema } from '../schemas'
import { goToStep, selectDraft, setAmount, setNarration } from '../sendMoneySlice'

export function AmountStep() {
  const dispatch = useAppDispatch()
  const draft = useAppSelector(selectDraft)
  const { data: balance } = useGetBalanceQuery()
  const available = balance?.available ?? null
  const id = useId()

  const schema = useMemo(() => makeAmountSchema(available), [available])
  const { register, handleSubmit, getValues, formState } = useForm<AmountForm>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: { amountInput: draft.amountInput, narration: draft.narration },
  })

  const save = (values: AmountForm) => {
    const parsed = parseNairaInputToKobo(values.amountInput)
    dispatch(setAmount({ input: values.amountInput, kobo: parsed.ok ? parsed.kobo : null }))
    dispatch(setNarration(values.narration))
  }

  const onSubmit = handleSubmit((values) => {
    save(values)
    dispatch(goToStep('review'))
  })

  // Back keeps whatever was typed, valid or not, so nothing is lost.
  const onBack = () => {
    save(getValues())
    dispatch(goToStep('recipient'))
  }

  const amountError = formState.errors.amountInput?.message
  const narrationError = formState.errors.narration?.message

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate className="flex flex-col gap-4">
      {draft.recipient && (
        <p className="text-muted-foreground text-sm">
          To <span className="text-foreground font-medium">{draft.recipient.accountName}</span> ·{' '}
          {draft.recipient.accountNumberMasked} · {draft.recipient.bankName}
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor={`${id}-amount`}>Amount (₦)</Label>
        <div className="relative">
          <span
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
          >
            ₦
          </span>
          <Input
            id={`${id}-amount`}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            className="pl-7 text-lg tabular-nums"
            aria-invalid={amountError ? true : undefined}
            aria-describedby={[`${id}-amount-hint`, amountError ? `${id}-amount-error` : null]
              .filter(Boolean)
              .join(' ')}
            {...register('amountInput')}
          />
        </div>
        <p id={`${id}-amount-hint`} className="text-muted-foreground text-xs">
          {available !== null ? (
            <>
              Available: <Money kobo={available} />
            </>
          ) : (
            'Up to 2 decimal places'
          )}
        </p>
        {amountError && (
          <p id={`${id}-amount-error`} className="text-destructive text-sm">
            {amountError}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${id}-narration`}>
          Narration <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <Input
          id={`${id}-narration`}
          maxLength={NARRATION_MAX_LENGTH}
          autoComplete="off"
          placeholder="What is this for?"
          aria-invalid={narrationError ? true : undefined}
          aria-describedby={narrationError ? `${id}-narration-error` : undefined}
          {...register('narration')}
        />
        {narrationError && (
          <p id={`${id}-narration-error`} className="text-destructive text-sm">
            {narrationError}
          </p>
        )}
      </div>

      <div className="flex justify-between gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button type="submit">Next</Button>
      </div>
    </form>
  )
}
