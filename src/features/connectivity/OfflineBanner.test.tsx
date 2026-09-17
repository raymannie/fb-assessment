import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { OfflineBanner } from './OfflineBanner'

function setOnline(value: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(value)
  window.dispatchEvent(new Event(value ? 'online' : 'offline'))
}

describe('OfflineBanner', () => {
  afterEach(() => vi.restoreAllMocks())

  it('is an empty live region while online and announces when the connection drops', () => {
    render(<OfflineBanner />)
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    act(() => setOnline(false))
    expect(screen.getByRole('status')).toHaveTextContent(/you’re offline/i)
    act(() => setOnline(true))
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })
})
