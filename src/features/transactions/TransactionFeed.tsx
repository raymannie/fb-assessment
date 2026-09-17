import {
  measureElement as defaultMeasureElement,
  useWindowVirtualizer,
} from '@tanstack/react-virtual'
import { Loader2Icon } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { getErrorMessage } from '@/api/errors'
import { useAppSelector } from '@/app/hooks'
import { useGetTransactionsInfiniteQuery } from '@/api/transactions'
import { AsyncState, EmptyState } from '@/components/AsyncState'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { selectSubmission } from '@/features/send-money/sendMoneySlice'
import type { ClientPhase } from '@/components/StatusBadge'
import type { Transaction } from '@/types/api'

import { countActiveFilters } from './filterModel'
import { FeedFilters } from './FeedFilters'
import { TransactionRow } from './TransactionRow'
import { useFeedFilters } from './useFeedFilters'

const ESTIMATED_ROW_PX = 84
const OVERSCAN = 8

// jsdom reports 0px boxes; fall back to the estimate so tests don't collapse the list.
const measureRow: NonNullable<
  Parameters<typeof useWindowVirtualizer<HTMLLIElement>>[0]['measureElement']
> = (el, entry, instance) => defaultMeasureElement(el, entry, instance) || ESTIMATED_ROW_PX
/** Start fetching the next page when the viewport is within this many rows of the end. */
const PREFETCH_THRESHOLD = 6

function FeedSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} className="h-20 w-full md:h-14" />
      ))}
    </div>
  )
}

export function TransactionFeed() {
  const { filters, setFilters, clearFilters } = useFeedFilters()
  const activeFilters = countActiveFilters(filters)
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useGetTransactionsInfiniteQuery(filters)

  const rows: Transaction[] = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data])

  // The optimistic row of an in-flight transfer shows its client phase instead of "Pending".
  const submission = useAppSelector(selectSubmission)
  const phaseRowId =
    submission && submission.status !== 'succeeded' && submission.status !== 'failed'
      ? submission.optimisticRowId
      : null
  const phase: ClientPhase | undefined =
    submission?.status === 'submitting'
      ? 'sending'
      : submission?.status === 'confirming'
        ? 'confirming'
        : submission?.status === 'unresolved'
          ? 'unconfirmed'
          : undefined
  // An error while we already have rows came from fetchNextPage (or a background refetch):
  // keep the rows on screen and show an inline retry instead of the full error state.
  const isFetchNextPageError = isError && rows.length > 0

  // The list scrolls with the window, so the virtualizer needs the list's offset from the top.
  const listRef = useRef<HTMLUListElement>(null)
  const [scrollMargin, setScrollMargin] = useState(0)
  const hasRows = rows.length > 0
  useLayoutEffect(() => {
    // Re-measure when the layout above the list changes (filters row, empty ↔ populated).
    setScrollMargin(listRef.current?.offsetTop ?? 0)
  }, [hasRows, activeFilters])

  const virtualizer = useWindowVirtualizer<HTMLLIElement>({
    count: rows.length,
    estimateSize: () => ESTIMATED_ROW_PX,
    overscan: OVERSCAN,
    scrollMargin,
    measureElement: measureRow,
  })
  const virtualItems = virtualizer.getVirtualItems()

  // Infinite scroll: fetch when the last rendered row is near the end. The "Load more" button
  // below is the keyboard / screen-reader / no-scroll-event fallback.
  const lastIndex = virtualItems.at(-1)?.index ?? -1
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage || isFetchNextPageError || rows.length === 0) return
    if (lastIndex >= rows.length - PREFETCH_THRESHOLD) void fetchNextPage()
  }, [lastIndex, rows.length, hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage])

  // Announce manual loads only; announcing every scroll-triggered page would be noise.
  const [announcement, setAnnouncement] = useState('')
  const announceNext = useRef(false)
  const previousCount = useRef(rows.length)
  useEffect(() => {
    if (announceNext.current && rows.length > previousCount.current) {
      setAnnouncement(
        `Loaded ${rows.length - previousCount.current} more. Showing ${rows.length} transactions.`,
      )
      announceNext.current = false
    }
    previousCount.current = rows.length
  }, [rows.length])

  const loadMore = useCallback(() => {
    announceNext.current = true
    void fetchNextPage()
  }, [fetchNextPage])

  const errorMessage = getErrorMessage(error)

  return (
    <Card>
      <CardHeader className="gap-4">
        <CardTitle asChild>
          <h2 id="feed-heading">Transactions</h2>
        </CardTitle>
        <FeedFilters filters={filters} onChange={setFilters} onClear={clearFilters} />
      </CardHeader>
      <CardContent>
        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>
        <AsyncState
          isLoading={isLoading}
          isError={isError && rows.length === 0}
          isEmpty={rows.length === 0}
          errorMessage={errorMessage}
          onRetry={() => void refetch()}
          retrying={isFetching}
          loadingLabel="Loading transactions"
          skeleton={<FeedSkeleton />}
          empty={
            activeFilters > 0 ? (
              <EmptyState
                title="No transactions match these filters"
                description="Try widening the date range or clearing a filter."
                action={
                  <Button type="button" variant="outline" onClick={clearFilters}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                title="No transactions yet"
                description="Payments you collect and send will show up here."
              />
            )
          }
        >
          <div
            aria-hidden="true"
            className="text-muted-foreground hidden grid-cols-[9.5rem_minmax(0,1fr)_7.5rem_9rem] gap-x-3 border-b px-1 pb-2 text-xs font-medium tracking-wide uppercase md:grid"
          >
            <span>Date</span>
            <span>Description</span>
            <span>Status</span>
            <span className="text-right">Amount</span>
          </div>

          {/* eslint-disable-next-line jsx-a11y/no-redundant-roles -- Safari/VoiceOver drops list semantics once list-style is reset; the explicit role restores them. */}
          <ul
            ref={listRef}
            role="list"
            aria-label="Transactions"
            aria-busy={isFetchingNextPage}
            data-testid="transaction-list"
            className="relative w-full"
            style={{ height: virtualizer.getTotalSize() }}
          >
            {virtualItems.map((item) => {
              const t = rows[item.index]
              if (!t) return null
              return (
                <li
                  key={t.id}
                  ref={virtualizer.measureElement}
                  data-index={item.index}
                  className="absolute top-0 left-0 w-full"
                  style={{
                    transform: `translateY(${item.start - virtualizer.options.scrollMargin}px)`,
                  }}
                >
                  <TransactionRow
                    description={t.description}
                    counterpartyName={t.counterparty.name}
                    accountNumberMasked={t.counterparty.accountNumberMasked}
                    bankName={t.counterparty.bankName}
                    amount={t.amount}
                    type={t.type}
                    status={t.status}
                    createdAt={t.createdAt}
                    phase={t.id === phaseRowId ? phase : undefined}
                  />
                </li>
              )
            })}
          </ul>

          <div className="flex flex-col items-center gap-2 pt-4 text-center">
            {isFetchNextPageError && (
              <p role="alert" className="text-destructive text-sm">
                Couldn’t load more: {errorMessage}
              </p>
            )}
            {hasNextPage ? (
              <Button
                type="button"
                variant="outline"
                onClick={loadMore}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? (
                  <>
                    <Loader2Icon aria-hidden="true" className="animate-spin" />
                    Loading more…
                  </>
                ) : isFetchNextPageError ? (
                  'Try again'
                ) : (
                  'Load more'
                )}
              </Button>
            ) : (
              <p className="text-muted-foreground text-xs">
                You’ve reached the end · {rows.length} transaction{rows.length === 1 ? '' : 's'}
              </p>
            )}
          </div>
        </AsyncState>
      </CardContent>
    </Card>
  )
}
