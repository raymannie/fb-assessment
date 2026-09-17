import type { ReactNode } from 'react'

import { ThemeToggle } from '@/features/theme/ThemeToggle'

export function AppHeader({ actions }: { actions?: ReactNode }) {
  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-30 border-b backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="text-primary text-lg font-bold tracking-tight">NovaBiz</span>
          <span className="text-muted-foreground hidden truncate text-sm sm:inline">
            Merchant dashboard
          </span>
        </div>
        <div className="flex items-center gap-2">
          {actions}
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
