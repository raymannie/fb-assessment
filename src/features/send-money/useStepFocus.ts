import { useCallback, useEffect, useRef } from 'react'

/**
 * Moves focus to the step heading whenever the step changes (WCAG 2.4.3 / 3.2.2).
 *
 * Returns a callback ref: the dialog body is portalled by Radix one commit after the dialog
 * itself renders, so a plain effect would run before the heading exists. The callback fires
 * exactly when the heading attaches, and again on every step change (new `step` → new ref).
 * Radix's own auto-focus is disabled on the dialog, so nothing competes for focus afterwards.
 */
export function useStepFocus<T extends HTMLElement>(step: string) {
  const node = useRef<T | null>(null)
  const focusedFor = useRef<string | null>(null)

  const focusIfNeeded = useCallback(
    (element: T | null) => {
      if (element && focusedFor.current !== step) {
        element.focus()
        focusedFor.current = step
      }
    },
    [step],
  )

  const ref = useCallback(
    (element: T | null) => {
      node.current = element
      focusIfNeeded(element)
    },
    [focusIfNeeded],
  )

  // Covers the case where the heading is already mounted and only `step` changed.
  useEffect(() => focusIfNeeded(node.current), [focusIfNeeded])

  return ref
}
