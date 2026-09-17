import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2Icon, Loader2Icon } from 'lucide-react'
import { useEffect, useId } from 'react'
import { useForm, useWatch } from 'react-hook-form'

import { getApiError, getErrorMessage } from '@/api/errors'
import { useLazyResolveRecipientQuery } from '@/api/recipients'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { BANKS, findBank } from '@/data/banks'
import { maskAccountNumber } from '@/lib/mask'
import { sanitizeText } from '@/lib/sanitize'

import { type RecipientForm, recipientSchema } from '../schemas'
import { goToStep, selectDraft, setRecipient } from '../sendMoneySlice'

const ENQUIRY_DEBOUNCE_MS = 300

export function RecipientStep() {
  const dispatch = useAppDispatch()
  const draft = useAppSelector(selectDraft)
  const id = useId()

  const form = useForm<RecipientForm>({
    resolver: zodResolver(recipientSchema),
    mode: 'onTouched',
    defaultValues: {
      accountNumber: draft.recipient?.accountNumber ?? '',
      bankCode: draft.recipient?.bankCode ?? '',
    },
  })
  const { register, handleSubmit, control, formState } = form
  const accountNumber = useWatch({ control, name: 'accountNumber' })
  const bankCode = useWatch({ control, name: 'bankCode' })

  const [resolve, enquiry] = useLazyResolveRecipientQuery()
  const inputValid = recipientSchema.safeParse({ accountNumber, bankCode }).success

  // Name enquiry as soon as both fields are valid (debounced while typing).
  useEffect(() => {
    if (!inputValid) return
    const timer = setTimeout(
      () => void resolve({ accountNumber, bankCode }, true),
      ENQUIRY_DEBOUNCE_MS,
    )
    return () => clearTimeout(timer)
  }, [inputValid, accountNumber, bankCode, resolve])

  const resolved =
    inputValid &&
    enquiry.isSuccess &&
    enquiry.originalArgs?.accountNumber === accountNumber &&
    enquiry.originalArgs.bankCode === bankCode
      ? enquiry.data
      : null
  const notFound =
    inputValid && enquiry.isError && getApiError(enquiry.error)?.code === 'RECIPIENT_NOT_FOUND'
  const enquiryFailed = inputValid && enquiry.isError && !notFound

  const onSubmit = handleSubmit((values) => {
    if (!resolved) return
    const bank = findBank(values.bankCode)
    dispatch(
      setRecipient({
        accountNumber: values.accountNumber,
        accountNumberMasked: maskAccountNumber(values.accountNumber),
        bankCode: values.bankCode,
        bankName: bank?.name ?? resolved.bankName,
        accountName: resolved.accountName,
      }),
    )
    dispatch(goToStep('amount'))
  })

  const accountError = formState.errors.accountNumber?.message
  const bankError = formState.errors.bankCode?.message

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate className="flex flex-col gap-4">
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-account`}>Account number</Label>
        <Input
          id={`${id}-account`}
          inputMode="numeric"
          autoComplete="off"
          maxLength={10}
          placeholder="10 digits"
          aria-invalid={accountError ? true : undefined}
          aria-describedby={accountError ? `${id}-account-error` : undefined}
          {...register('accountNumber')}
        />
        {accountError && (
          <p id={`${id}-account-error`} className="text-destructive text-sm">
            {accountError}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${id}-bank`}>Bank</Label>
        <NativeSelect
          id={`${id}-bank`}
          aria-invalid={bankError ? true : undefined}
          aria-describedby={bankError ? `${id}-bank-error` : undefined}
          {...register('bankCode')}
        >
          <option value="">Choose a bank</option>
          {BANKS.map((bank) => (
            <option key={bank.code} value={bank.code}>
              {bank.name}
            </option>
          ))}
        </NativeSelect>
        {bankError && (
          <p id={`${id}-bank-error`} className="text-destructive text-sm">
            {bankError}
          </p>
        )}
      </div>

      {/* Name enquiry result. role=status for progress/success, role=alert for problems. */}
      <div className="min-h-12">
        {inputValid && enquiry.isFetching && (
          <p role="status" className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2Icon aria-hidden="true" className="size-4 animate-spin" />
            Looking up account name…
          </p>
        )}
        {resolved && !enquiry.isFetching && (
          <p
            role="status"
            className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
          >
            <CheckCircle2Icon aria-hidden="true" className="size-4 shrink-0" />
            <span>
              <span className="font-semibold">
                {sanitizeText(resolved.accountName, { maxLength: 80 })}
              </span>
              <span className="text-muted-foreground"> · {resolved.accountNumberMasked}</span>
            </span>
          </p>
        )}
        {notFound && !enquiry.isFetching && (
          <p role="alert" className="text-destructive text-sm">
            No account found for that number at this bank. Check the number and bank.
          </p>
        )}
        {enquiryFailed && !enquiry.isFetching && (
          <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-destructive">
              Couldn’t look up the account name: {getErrorMessage(enquiry.error)}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void resolve({ accountNumber, bankCode }, false)}
            >
              Try again
            </Button>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={!resolved || enquiry.isFetching}>
          Next
        </Button>
      </div>
    </form>
  )
}
