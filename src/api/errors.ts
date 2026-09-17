import type { FetchBaseQueryError } from '@reduxjs/toolkit/query'
import type { SerializedError } from '@reduxjs/toolkit'

import { type ApiError, apiErrorSchema } from '@/types/api'

export type QueryError = FetchBaseQueryError | SerializedError | undefined

/** Narrows an RTK Query error to one carrying our ApiError body. */
export function getApiError(error: QueryError): ApiError['error'] | null {
  if (!error || !('status' in error)) return null
  const parsed = apiErrorSchema.safeParse(error.data)
  return parsed.success ? parsed.data.error : null
}

/** True when the request never produced an answer: timeout, offline, DNS, aborted, unparsable. */
export function isNetworkError(error: QueryError): boolean {
  if (!error || !('status' in error)) return false
  return (
    error.status === 'FETCH_ERROR' ||
    error.status === 'TIMEOUT_ERROR' ||
    error.status === 'PARSING_ERROR'
  )
}

/** A short, user-safe message. Never echoes raw server text that is not from our error shape. */
export function getErrorMessage(
  error: QueryError,
  fallback = 'Something went wrong. Please try again.',
): string {
  const api = getApiError(error)
  if (api) return api.message
  if (!error) return fallback
  if ('status' in error) {
    if (error.status === 'TIMEOUT_ERROR')
      return 'The request timed out. Check your connection and try again.'
    if (error.status === 'FETCH_ERROR')
      return 'Could not reach the server. Check your connection and try again.'
    if (typeof error.status === 'number' && error.status >= 500)
      return 'The server had a problem. Please try again.'
  }
  return fallback
}
