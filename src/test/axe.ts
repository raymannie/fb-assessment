import { configureAxe } from 'vitest-axe'

/**
 * axe for jsdom. Colour contrast needs a real layout engine (jsdom has no canvas),
 * so it is disabled here and asserted in Playwright with @axe-core/playwright instead.
 */
export const runAxe = configureAxe({
  rules: { 'color-contrast': { enabled: false } },
})
