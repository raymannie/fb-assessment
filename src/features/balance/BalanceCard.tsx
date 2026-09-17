import { ArrowDownLeftIcon, ArrowUpRightIcon, RefreshCwIcon } from 'lucide-react'

import { useGetBalanceQuery } from '@/api/balance'
import { getErrorMessage } from '@/api/errors'
import { AsyncState } from '@/components/AsyncState'
import { Money } from '@/components/Money'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatLagosDateTime } from '@/lib/date'
import { cn } from '@/lib/utils'

function BalanceSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-9 w-44" />
      <Skeleton className="h-4 w-56" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
      </div>
    </div>
  )
}

export function BalanceCard() {
  const { data, isLoading, isError, isFetching, error, refetch } = useGetBalanceQuery()

  return (
    <Card data-testid="balance-card">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle asChild>
          <h2 id="balance-heading">Available balance</h2>
        </CardTitle>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => void refetch()}
          disabled={isFetching}
          aria-label="Refresh balance"
        >
          <RefreshCwIcon aria-hidden="true" className={cn(isFetching && 'animate-spin')} />
        </Button>
      </CardHeader>
      <CardContent>
        <AsyncState
          isLoading={isLoading}
          isError={isError && !data}
          errorMessage={getErrorMessage(error)}
          onRetry={() => void refetch()}
          retrying={isFetching}
          loadingLabel="Loading balance"
          skeleton={<BalanceSkeleton />}
        >
          {data && (
            <div className="space-y-4">
              <div>
                <p className="text-3xl font-semibold tracking-tight">
                  <Money kobo={data.available} />
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Ledger <Money kobo={data.ledger} /> · as of{' '}
                  {formatLagosDateTime(data.asOf, 'short')}
                  {isError && <span className="text-destructive"> · couldn’t refresh</span>}
                </p>
              </div>
              <dl className="grid grid-cols-2 gap-3">
                <div className="bg-muted/50 rounded-lg p-3">
                  <dt className="text-muted-foreground flex items-center gap-1 text-xs">
                    <ArrowDownLeftIcon
                      aria-hidden="true"
                      className="size-3.5 text-emerald-700 dark:text-emerald-400"
                    />
                    Today’s inflow
                  </dt>
                  <dd className="mt-1 font-semibold text-emerald-800 dark:text-emerald-300">
                    <Money kobo={data.today.inflow} signDisplay="always" />
                  </dd>
                </div>
                <div className="bg-muted/50 rounded-lg p-3">
                  <dt className="text-muted-foreground flex items-center gap-1 text-xs">
                    <ArrowUpRightIcon aria-hidden="true" className="size-3.5" />
                    Today’s outflow
                  </dt>
                  <dd className="mt-1 font-semibold">
                    <Money kobo={data.today.outflow} signDisplay="never" />
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </AsyncState>
      </CardContent>
    </Card>
  )
}
