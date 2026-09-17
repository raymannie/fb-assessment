import { SendIcon } from 'lucide-react'
import { lazy, Suspense } from 'react'

import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { openDialog, selectIsLocked, selectSendMoneyOpen } from './sendMoneySlice'

// Code-split: the Send Money flow (forms, zod, reconciliation orchestration) only loads on first open.
const SendMoneyDialog = lazy(() => import('./SendMoneyDialog'))

export function SendMoneyCta({ className }: { className?: string }) {
  const dispatch = useAppDispatch()
  const open = useAppSelector(selectSendMoneyOpen)
  const locked = useAppSelector(selectIsLocked)

  return (
    <>
      <Button
        type="button"
        className={cn('gap-2', className)}
        onClick={() => dispatch(openDialog())}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <SendIcon aria-hidden="true" />
        {locked ? 'Transfer in progress' : 'Send money'}
      </Button>
    </>
  )
}

/** Mounted once in the shell (not per CTA) so the lazy chunk and dialog state are shared. */
export function SendMoneyDialogHost() {
  const open = useAppSelector(selectSendMoneyOpen)
  const locked = useAppSelector(selectIsLocked)
  // Load the chunk on first open; keep it mounted afterwards so polling/UI state survives close.
  const shouldMount = open || locked
  if (!shouldMount) return null
  return (
    <Suspense fallback={null}>
      <SendMoneyDialog />
    </Suspense>
  )
}
