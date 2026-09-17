import type { TransactionFilters } from '@/types/api'

import { hashString } from './prng'

/**
 * Keyset cursor: position = last item's (createdAt, id) + a hash of the filters it was
 * issued for. Opaque to the client. Stable under inserts at the head (a new transfer never
 * shifts or duplicates rows on the next page, unlike offset paging).
 */
export interface CursorPayload {
  v: 1
  createdAt: string
  id: string
  f: number
}

export function filtersHash(filters: TransactionFilters): number {
  return hashString(
    [filters.from ?? '', filters.to ?? '', filters.status ?? '', filters.type ?? ''].join('|'),
  )
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  bytes.forEach((b) => (binary += String.fromCharCode(b)))
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): string {
  const padded =
    text.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (text.length % 4)) % 4)
  const binary = atob(padded)
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)))
}

export function encodeCursor(payload: Omit<CursorPayload, 'v'>): string {
  return toBase64Url(JSON.stringify({ v: 1, ...payload }))
}

function isCursorPayload(value: unknown): value is CursorPayload {
  if (typeof value !== 'object' || value === null) return false
  const c = value as Record<string, unknown>
  return (
    c.v === 1 &&
    typeof c.createdAt === 'string' &&
    typeof c.id === 'string' &&
    typeof c.f === 'number'
  )
}

/** Returns null for anything that is not a well-formed cursor. */
export function decodeCursor(cursor: string): CursorPayload | null {
  try {
    const parsed: unknown = JSON.parse(fromBase64Url(cursor))
    return isCursorPayload(parsed) ? parsed : null
  } catch {
    return null
  }
}
