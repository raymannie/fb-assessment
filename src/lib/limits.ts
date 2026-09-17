import { toKobo } from '@/lib/money'

/**
 * Transfer limits, shared by the client-side schema and the mock server so the UI
 * can pre-empt the error while the server stays the source of truth.
 * ₦5,000,000 stands in for a CBN tier limit; a real backend serves these per merchant.
 */
export const MIN_TRANSFER_KOBO = toKobo(100) // ₦1.00
export const MAX_TRANSFER_KOBO = toKobo(5_000_000_00) // ₦5,000,000.00
