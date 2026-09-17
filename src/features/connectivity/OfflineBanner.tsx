import { WifiOffIcon } from 'lucide-react'

import { useOnlineStatus } from './useOnlineStatus'

export function OfflineBanner() {
  const online = useOnlineStatus()
  return (
    <div role="status" aria-live="polite" data-testid="offline-banner">
      {!online && (
        <div className="border-b border-slate-300 bg-slate-100 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          <p className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2 text-sm">
            <WifiOffIcon aria-hidden="true" className="size-4 shrink-0" />
            You’re offline. Balances and transactions may be out of date; sending money is paused
            until you reconnect.
          </p>
        </div>
      )}
    </div>
  )
}
