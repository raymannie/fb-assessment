import { delay, HttpResponse } from 'msw'
import type { z } from 'zod'

import type { ApiError, ApiErrorCode } from '@/types/api'

import { getMockConfig } from '../config'

let requestCounter = 0
export function nextRequestId(): string {
  requestCounter += 1
  return `req_${Date.now().toString(36)}_${requestCounter}`
}

export function apiError(
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: Record<string, string>,
): HttpResponse<ApiError> {
  const body: ApiError = {
    error: { code, message, requestId: nextRequestId(), ...(details ? { details } : {}) },
  }
  return HttpResponse.json(body, { status })
}

/** Flattens a zod failure into { "path.to.field": "message" } for the error body. */
export function zodDetails(error: z.ZodError): Record<string, string> {
  const details: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.map(String).join('.') || '_'
    details[key] ??= issue.message
  }
  return details
}

export async function simulateLatency(): Promise<void> {
  const [min, max] = getMockConfig().latencyMs
  if (max <= 0) return
  await delay(min + Math.random() * (max - min))
}

/** Rolls the configured read failure rate. Returns a response to send, or null to proceed. */
export function maybeReadFailure(): HttpResponse<ApiError> | null {
  const { failureRate } = getMockConfig()
  if (failureRate > 0 && Math.random() < failureRate) {
    return apiError(500, 'INTERNAL', 'Simulated server error (mock failureRate)')
  }
  return null
}

/** Never resolves. The client's timeout (AbortController) is what ends the request. */
export function hangForever(): Promise<never> {
  return delay('infinite') as Promise<never>
}
