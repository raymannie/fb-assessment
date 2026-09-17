import { lazy, Suspense } from 'react'

import { AppHeader } from '@/components/AppHeader'
import { BalanceCard } from '@/features/balance/BalanceCard'
import { OfflineBanner } from '@/features/connectivity/OfflineBanner'
import { SendMoneyCta, SendMoneyDialogHost } from '@/features/send-money/SendMoneyCta'
import { TransferStatusBanner } from '@/features/send-money/TransferStatusBanner'
import { TransactionFeed } from '@/features/transactions/TransactionFeed'
import { env } from '@/lib/env'

// Dev-only chunk; the import is dead code in production builds unless VITE_MOCK_PANEL=true.
const DevSettingsPanel = env.mockPanelEnabled
  ? lazy(() => import('@/mocks/DevSettingsPanel'))
  : null

export default function App() {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="bg-primary text-primary-foreground sr-only z-50 rounded-md px-3 py-2 focus:not-sr-only focus:absolute focus:top-2 focus:left-2"
      >
        Skip to main content
      </a>

      <AppHeader actions={<SendMoneyCta className="hidden sm:inline-flex" />} />
      <OfflineBanner />
      <TransferStatusBanner />

      <main
        id="main"
        tabIndex={-1}
        className="mx-auto grid w-full max-w-6xl flex-1 gap-4 px-4 py-4 pb-24 outline-none sm:pb-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start"
      >
        <section aria-labelledby="balance-heading" className="lg:sticky lg:top-18 lg:order-2">
          <BalanceCard />
        </section>
        <section aria-labelledby="feed-heading" className="min-w-0 lg:order-1">
          <TransactionFeed />
        </section>
      </main>

      {/* Mobile: thumb-reachable primary action, above the home indicator. */}
      <div className="bg-background/95 fixed inset-x-0 bottom-0 z-30 border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:hidden">
        <SendMoneyCta className="w-full" />
      </div>

      <SendMoneyDialogHost />

      {DevSettingsPanel && (
        <Suspense fallback={null}>
          <DevSettingsPanel />
        </Suspense>
      )}
    </div>
  )
}
