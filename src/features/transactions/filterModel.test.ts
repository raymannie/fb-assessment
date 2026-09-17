import { describe, expect, it } from 'vitest'

import { countActiveFilters, parseFilters, serializeFilters } from './filterModel'

describe('feed filters ⇄ URL', () => {
  it.each([
    ['', {}],
    ['?status=failed&type=debit', { status: 'failed', type: 'debit' }],
    ['?from=2026-09-01&to=2026-09-17', { from: '2026-09-01', to: '2026-09-17' }],
    ['?status=bogus&type=credit', { type: 'credit' }],
    ['?from=17/09/2026', {}],
    ['?from=2026-09-17&to=2026-09-01', {}], // inverted range dropped
    [
      '?from=2026-09-17&to=2026-09-17&status=pending',
      { from: '2026-09-17', to: '2026-09-17', status: 'pending' },
    ],
    ['?status=<script>', {}],
  ])('parses %p → %o', (search, expected) => {
    expect(parseFilters(search)).toEqual(expected)
  })

  it('serializes without clobbering unrelated params and round-trips', () => {
    const params = serializeFilters({ status: 'failed', from: '2026-09-01' }, '?utm=x&type=credit')
    expect(params.get('utm')).toBe('x')
    expect(params.get('type')).toBeNull()
    expect(parseFilters(`?${params.toString()}`)).toEqual({ status: 'failed', from: '2026-09-01' })
  })

  it('counts active filters', () => {
    expect(countActiveFilters({})).toBe(0)
    expect(countActiveFilters({ status: 'failed', to: '2026-09-17' })).toBe(2)
  })
})
