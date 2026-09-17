# CLAUDE.md — NovaBiz Merchant Dashboard

Take-home for a Senior Frontend Engineer role (FirstBank Digital Factory).
This is a fintech app: correctness of money, safe async reconciliation, accessibility,
and test rigor matter more than feature count. Prefer small, reviewable changes.

## Stack (fixed — do not substitute)

- Vite + React 18 + TypeScript (`strict: true`, `noUncheckedIndexedAccess: true`)
- Tailwind CSS + shadcn/ui (Radix primitives)
- Redux Toolkit + RTK Query (all server state goes through RTK Query; Redux slices only for true client state such as the send-money draft and UI prefs)
- MSW v2 for the mock API (browser worker in dev + e2e, node server in Vitest)
- @tanstack/react-virtual for the transaction feed
- react-hook-form + zod for forms
- Vitest + React Testing Library + @testing-library/user-event + vitest-axe
- Playwright (+ @axe-core/playwright) for e2e
- ESLint + Prettier

## Folder layout

```
src/
  app/            store.ts, hooks.ts, providers.tsx, router
  api/            baseApi.ts (RTK Query), endpoints per domain
  mocks/          handlers/, db.ts (in-memory seed), config.ts (latency/failure), browser.ts, server.ts
  features/
    balance/
    transactions/ (feed, filters, virtualized list)
    send-money/   (steps, slice, reconciliation)
  components/ui/  shadcn components (generated)
  components/     shared app components (AsyncBoundary states, Money, etc.)
  lib/money/      kobo.ts, format.ts, parse.ts (+ tests)
  lib/            idempotency.ts, sanitize.ts, retry.ts
  types/
e2e/
```

## MONEY RULES (non-negotiable)

- Money is ALWAYS an integer number of kobo in state, API payloads, and arithmetic. Type it as a branded type: `type Kobo = number & { __brand: 'Kobo' }`.
- Never do `amount / 100` in arithmetic, and never do `parseFloat(input) * 100` (for example, `19.99 * 100 === 1998.9999999999998`).
- Parse user input (like "1,000.50") into kobo with string/integer logic only: split on the decimal point, validate at most 2 decimal places, and combine with integer math. Reject values over `Number.MAX_SAFE_INTEGER`.
- Display only through `formatNaira(kobo)` in `lib/money/format.ts`. It uses a cached `Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' })`. Build its input exactly: pass a decimal string (`"1000.50"`) built from integer quotient and remainder (Intl.NumberFormat accepts exact decimal strings). Do not string-splice the _output_.
- Handle negative values and zero. Sums/totals are integer reductions over kobo.
- Every money util has table-driven unit tests, including 0, 1, 99, 100, 100050, negatives, and large values.

## Send Money / optimistic update rules

- Flow: recipient → amount → review → confirm. Each step validates before advancing.
- The Idempotency-Key is `crypto.randomUUID()`, generated when the user reaches Review. It is reused for every retry of that same transfer and regenerated only if the recipient or amount changes. It is sent as an `Idempotency-Key` header.
- The mock server stores keys, and a repeat key returns the ORIGINAL result without creating a second debit.
- Optimistic update: in `onQueryStarted`, insert a `pending` debit row and decrement the balance using `updateQueryData`. Keep the patch results.
- Reconciliation outcomes:
  - **2xx:** replace the optimistic row with the server row and invalidate the balance and transactions.
  - **Definite failure (4xx or explicit error):** undo the patches and show an error with a retry option.
  - **Timeout / network error = UNKNOWN, not failed:** the money may have moved. Mark the row "confirming". Query `GET /transfers/:idempotencyKey` (retry with backoff). Resolve to success or failure from the server's answer. Never roll back blindly and never let the user resubmit with a new key while the outcome is unknown.
- The confirm button is disabled while a submission is in flight (double-click safe).
- Use request timeouts via AbortController (configurable).

## Security / NDPA

- Never use `dangerouslySetInnerHTML`. Add an ESLint rule forbidding it.
- Render descriptions and merchant text as plain text only. Strip control and bidi-override characters (`lib/sanitize.ts`) and cap the length.
- Mask account numbers (e.g. `******4821`). Do not log PII.
- Nothing sensitive goes in localStorage. Only the theme preference may be stored there.

## Accessibility (WCAG AA)

- Send Money must be fully keyboard operable. Move focus to the step heading on step change.
- Every input has a `<label>`. Errors are linked via `aria-describedby` and fields use `aria-invalid`.
- Use one polite `aria-live` region for transfer status. Failures are announced assertively.
- Focus rings must be visible (don't remove the outline). Color contrast is AA in both themes.
- Don't rely on color alone for status: show text or an icon as well.

## Responsiveness

- Mobile first, from 360px to 1440px. Touch targets are at least 44px.
- The feed renders as cards on mobile and table-like rows on desktop.
- Keep bundle size in mind (low-end Android): lazy-load the Send Money route/dialog.

## Async states

- Every data view has explicit loading (skeleton), empty, and error (with Retry) states.
- Use a shared `<AsyncState>` pattern rather than ad-hoc spinners.

## Mock API

- The in-memory db is seeded with 1,500+ deterministic transactions (seeded PRNG).
- Endpoints:
  - `GET /api/balance`
  - `GET /api/transactions?cursor&limit&from&to&status&type`
  - `POST /api/transfers`
  - `GET /api/transfers/:idempotencyKey`
  - `GET /api/recipients/resolve?accountNumber&bankCode` (name enquiry)
- Config (latency range, failure rate, timeout rate) comes from env vars AND a dev-only settings panel, persisted in sessionStorage. Tests can set it deterministically.
- Some descriptions in the seed data are hostile (`<img src=x onerror=alert(1)>`, very long text, RTL override characters) to prove sanitization.

## Working agreement

- Before large changes, propose a plan and wait for approval.
- After each phase, run `npm run typecheck && npm run lint && npm test` and fix failures.
- Don't add dependencies beyond the list above without asking.
- Keep components small. Memoize list rows. Avoid re-rendering the whole feed when the balance updates.
- Write tests alongside code, not at the end.
