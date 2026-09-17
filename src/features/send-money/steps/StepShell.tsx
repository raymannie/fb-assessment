import { WifiOffIcon } from 'lucide-react'
import type { ReactNode, RefCallback } from 'react'

import { DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useOnlineStatus } from '@/features/connectivity/useOnlineStatus'

import { type SendMoneyStep, STEPS } from '../sendMoneySlice'

const TITLES: Record<SendMoneyStep, string> = {
  recipient: 'Who are you sending to?',
  amount: 'How much?',
  review: 'Review transfer',
  confirm: 'Confirm transfer',
}

interface StepShellProps {
  step: SendMoneyStep
  headingRef: RefCallback<HTMLHeadingElement>
  children: ReactNode
}

export function StepShell({ step, headingRef, children }: StepShellProps) {
  const index = STEPS.indexOf(step) + 1
  const online = useOnlineStatus()
  return (
    <>
      <div className="flex flex-col gap-1">
        <DialogDescription className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Send money · Step {index} of {STEPS.length}
        </DialogDescription>
        <DialogTitle asChild>
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="focus-visible:ring-ring/50 rounded-md text-lg font-semibold outline-none focus-visible:ring-3"
          >
            {TITLES[step]}
          </h2>
        </DialogTitle>
      </div>
      {!online && (
        <p
          role="alert"
          data-testid="send-money-offline"
          className="flex items-start gap-2 rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        >
          <WifiOffIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          You’re offline. You can keep filling in the details, but the transfer can’t be sent until
          you reconnect.
        </p>
      )}
      {children}
    </>
  )
}
