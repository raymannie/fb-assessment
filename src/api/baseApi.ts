import {
  type BaseQueryFn,
  createApi,
  type FetchArgs,
  type FetchBaseQueryError,
  type FetchBaseQueryMeta,
  fetchBaseQuery,
} from '@reduxjs/toolkit/query/react'

import { env } from '@/lib/env'
import { backoffDelayMs, sleep } from '@/lib/retry'

import { isNetworkError } from './errors'

// Absolute so Node's fetch (Vitest + MSW node) resolves it the same way the browser does.
const baseUrl =
  typeof window === 'undefined' ? '/api' : new URL('/api', window.location.href).toString()

const rawBaseQuery = fetchBaseQuery({ baseUrl, timeout: env.requestTimeoutMs })

/** Per-endpoint override: `extraOptions: { maxRetries: 0 }` opts out (the status poll has its own loop). */
export interface RetryExtraOptions {
  maxRetries?: number
}

export const GET_RETRY = {
  maxRetries: 2,
  baseMs: env.getRetryBaseMs,
  factor: 2,
  maxMs: env.getRetryBaseMs * 4,
  jitter: 0.2,
}

/**
 * Retries idempotent reads on *network* failures only (offline, DNS, timeout) with backoff.
 * Never retries a write — POST /transfers has its own reconciliation — and never retries an
 * HTTP error response (the server answered; asking again won't change a 4xx/5xx).
 */
const baseQueryWithRetry: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError,
  RetryExtraOptions,
  FetchBaseQueryMeta
> = async (args, api, extraOptions) => {
  const method = (typeof args === 'string' ? 'GET' : (args.method ?? 'GET')).toUpperCase()
  const maxRetries = method === 'GET' ? (extraOptions?.maxRetries ?? GET_RETRY.maxRetries) : 0

  for (let attempt = 0; ; attempt++) {
    const result = await rawBaseQuery(args, api, extraOptions)
    const retryable =
      result.error !== undefined && isNetworkError(result.error) && !api.signal.aborted
    if (!retryable || attempt >= maxRetries) return result
    await sleep(backoffDelayMs(attempt, GET_RETRY))
  }
}

/**
 * Single RTK Query API slice. Domain endpoints are injected from `src/api/<domain>.ts`
 * via `baseApi.injectEndpoints`, so the Send Money chunk can be lazy-loaded without
 * pulling its endpoints into the initial bundle.
 *
 * `timeout` uses an AbortController under the hood and surfaces as `{ status: 'TIMEOUT_ERROR' }`,
 * which the reconciliation logic treats as an UNKNOWN outcome, never a definite failure.
 */
export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithRetry,
  tagTypes: ['Balance', 'Transactions', 'Transfer'] as const,
  endpoints: () => ({}),
  refetchOnReconnect: true,
})
