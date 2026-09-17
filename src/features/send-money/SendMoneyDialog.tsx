import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { restoreOpenerFocus } from '@/lib/returnFocus'

import { closeDialog, selectSendMoneyOpen, selectStep } from './sendMoneySlice'
import { AmountStep } from './steps/AmountStep'
import { ConfirmStep } from './steps/ConfirmStep'
import { RecipientStep } from './steps/RecipientStep'
import { ReviewStep } from './steps/ReviewStep'
import { StepShell } from './steps/StepShell'
import { useStepFocus } from './useStepFocus'

const STEP_COMPONENTS = {
  recipient: RecipientStep,
  amount: AmountStep,
  review: ReviewStep,
  confirm: ConfirmStep,
} as const

/**
 * Lazy chunk. A bottom sheet below `sm`, a centred dialog above. Step state lives in the
 * slice, so closing mid-flow and reopening resumes where the user left off.
 */
export default function SendMoneyDialog() {
  const dispatch = useAppDispatch()
  const open = useAppSelector(selectSendMoneyOpen)
  const step = useAppSelector(selectStep)
  const headingRef = useStepFocus<HTMLHeadingElement>(open ? step : 'closed')
  const Step = STEP_COMPONENTS[step]

  return (
    <Dialog open={open} onOpenChange={(next) => !next && dispatch(closeDialog())}>
      <DialogContent
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={restoreOpenerFocus}
        className="max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-h-[92dvh] max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:overflow-y-auto max-sm:rounded-t-2xl max-sm:rounded-b-none max-sm:pb-[max(1rem,env(safe-area-inset-bottom))] sm:max-w-md"
      >
        <StepShell step={step} headingRef={headingRef}>
          <Step />
        </StepShell>
      </DialogContent>
    </Dialog>
  )
}
