import { AlertCircleIcon, InboxIcon, RefreshCwIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ErrorStateProps {
  title?: string
  message: string
  onRetry?: () => void
  retrying?: boolean
  className?: string
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  retrying,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center gap-3 py-8 text-center', className)}
    >
      <AlertCircleIcon aria-hidden="true" className="text-destructive size-8" />
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        <p className="text-muted-foreground text-sm">{message}</p>
      </div>
      {onRetry && (
        <Button type="button" variant="outline" onClick={onRetry} disabled={retrying}>
          <RefreshCwIcon aria-hidden="true" className={cn(retrying && 'animate-spin')} />
          {retrying ? 'Retrying…' : 'Retry'}
        </Button>
      )}
    </div>
  )
}

interface EmptyStateProps {
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div
      role="status"
      className={cn('flex flex-col items-center gap-3 py-8 text-center', className)}
    >
      <InboxIcon aria-hidden="true" className="text-muted-foreground size-8" />
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        {description && <p className="text-muted-foreground text-sm">{description}</p>}
      </div>
      {action}
    </div>
  )
}

interface AsyncStateProps {
  isLoading: boolean
  isError: boolean
  isEmpty?: boolean
  errorMessage?: string
  onRetry?: () => void
  retrying?: boolean
  /** Accessible name for the loading skeleton, e.g. "Loading balance". */
  loadingLabel: string
  skeleton: ReactNode
  empty?: ReactNode
  children: ReactNode
}

/**
 * One place that decides between loading / error / empty / ready, so every data view
 * has the same explicit states and nobody hand-rolls a spinner.
 */
export function AsyncState({
  isLoading,
  isError,
  isEmpty = false,
  errorMessage = 'Something went wrong. Please try again.',
  onRetry,
  retrying,
  loadingLabel,
  skeleton,
  empty,
  children,
}: AsyncStateProps) {
  if (isLoading) {
    return (
      <div aria-busy="true" role="status" aria-label={loadingLabel}>
        {skeleton}
      </div>
    )
  }
  if (isError) return <ErrorState message={errorMessage} onRetry={onRetry} retrying={retrying} />
  if (isEmpty) return <>{empty}</>
  return <>{children}</>
}
