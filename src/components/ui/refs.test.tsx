import { render } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it } from 'vitest'

import { Button } from './button'
import { Input } from './input'

// shadcn v4 ships React-19-style components (ref as a prop). On React 18 that drops the ref
// silently, which broke Radix popover positioning and would break react-hook-form's register.
describe('ui primitives forward refs (React 18)', () => {
  it('Button exposes its DOM node', () => {
    const ref = createRef<HTMLButtonElement>()
    render(<Button ref={ref}>Go</Button>)
    expect(ref.current).toBeInstanceOf(HTMLButtonElement)
  })

  it('Button asChild forwards the ref to the child element', () => {
    const ref = createRef<HTMLButtonElement>()
    render(
      <Button asChild ref={ref}>
        <a href="/x">Link</a>
      </Button>,
    )
    expect(ref.current).toBeInstanceOf(HTMLAnchorElement)
  })

  it('Input exposes its DOM node', () => {
    const ref = createRef<HTMLInputElement>()
    render(<Input ref={ref} aria-label="Amount" />)
    expect(ref.current).toBeInstanceOf(HTMLInputElement)
  })
})
