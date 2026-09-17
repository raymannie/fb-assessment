import { type TransactionFilters, type TransactionsPage, transactionsPageSchema } from '@/types/api'

import { baseApi } from './baseApi'

export const FEED_PAGE_SIZE = 50

/**
 * Cursor-paginated feed. One cache entry per filter combination; pages accumulate under it.
 * The optimistic Send Money row (Phase 5) patches every cached entry whose filters match it.
 */
export const transactionsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getTransactions: build.infiniteQuery<TransactionsPage, TransactionFilters, string | null>({
      infiniteQueryOptions: {
        initialPageParam: null,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      },
      query: ({ queryArg: filters, pageParam }) => ({
        url: '/transactions',
        params: {
          limit: FEED_PAGE_SIZE,
          ...(pageParam ? { cursor: pageParam } : {}),
          ...(filters.from ? { from: filters.from } : {}),
          ...(filters.to ? { to: filters.to } : {}),
          ...(filters.status ? { status: filters.status } : {}),
          ...(filters.type ? { type: filters.type } : {}),
        },
      }),
      transformResponse: (raw: unknown) => transactionsPageSchema.parse(raw),
      providesTags: ['Transactions'],
    }),
  }),
})

export const { useGetTransactionsInfiniteQuery } = transactionsApi
