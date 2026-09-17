# AI usage log (raw notes → AI_USAGE.md)

Tool: Claude Code (Opus). Prompts live in PROMPTS.md; this file records what came back and what I changed.

## Phase 0 — plan

Asked for architecture, API contract, reconciliation state machine, build order, and to challenge CLAUDE.md.
Notable pushback from the model, which I accepted:

- Don't `invalidateTags(['Transactions'])` after a successful transfer — an RTK `infiniteQuery` refetches
  every loaded page sequentially. Patch the server row into the cache instead; invalidate `Balance` only.
- `updateQueryData` for the optimistic row must iterate `selectCachedArgsForQuery` and only patch cache
  entries whose filters would include a pending debit.
- Idempotency key must be regenerated on _any_ payload change (narration too), not just recipient/amount;
  the mock should 422 on key/payload mismatch.
- Mock config needs a `timeoutMode: 'committed' | 'dropped'` so the 404-after-timeout path is testable.

## Phase 1 — scaffold

- Vite's current template ships React 19 / TS 7 / oxlint; the stack is fixed to React 18 / ESLint, so the
  package.json was written by hand from real registry versions.
- npm 10.9 crashed resolving Vitest 4.1's peer set; bisected 4.0.18 (installs, but has a moderate
  advisory), 4.1.x (crash), 5.0.1 (installs clean) → chose Vitest 5, checked its breaking-changes list first.
- shadcn v4 CLI added `shadcn` (8 MB CLI) as a _runtime_ dependency, a `cn` package, `next-themes`, and the
  Geist font. All removed; `cn` reimplemented with clsx + tailwind-merge; theme wired to Redux instead.
- shadcn `form` is now a deprecated alias that generates nothing; `field` is its successor.
- Generated `CardTitle` is a `<div>`; the first RTL test (`getByRole('heading')`) caught it. Added the
  `asChild` pattern and real `<h2>`s.
- Default shadcn button is 32 px tall — below the 44 px touch-target rule. Bumped sizes on small screens.
- Playwright's `reuseExistingServer` attached to an unrelated dev server on :5173 (another project) and
  the axe test "passed" against a login page. e2e now uses a dedicated port and never reuses a server.
- Dropped my own `exactOptionalPropertyTypes` (beyond CLAUDE.md) after it broke generated calendar code.

## Phase 2 — money utilities (test-first)

- Probed the runtime before writing tests: Node 22 / ICU 78 formats `en-NG` NGN as `₦1,000.50`
  (U+20A6, ASCII separators, hyphen-minus). `en-US` gives `NGN 1,000.50` with U+00A0 — the trap.
  Added a preflight test that fails with a clear message on small-icu builds.
- Verified `Intl.NumberFormat#format` accepts a decimal _string_ and keeps it exact up to
  MAX_SAFE_INTEGER kobo (`9007199254740991` survives digit-for-digit). TS types this input as
  `` `${number}` ``, so `koboToDecimalString` returns a `DecimalString` alias.
- First draft used `-kobo` on the branded type; `@typescript-eslint/no-unsafe-unary-minus` rejected
  it → `Math.abs` (exact for safe integers).
- Prettier/heredoc turned ` ` escapes into literal invisible characters inside a regex, and my
  own cleanup script then replaced the NBSP with a space — which would have silently made the
  "no NBSP" test meaningless. Rewrote with explicit `\uXXXX` escapes; `no-irregular-whitespace` was
  the lint rule that surfaced it.
- 110 table-driven cases across kobo/parse/format/sum, all integer/string logic; zero `/ 100`.

## Phase 3 — mock API

- Contract: zod schemas in `src/types/api.ts` are the single source of truth; the mock validates
  requests with them and (Phase 4) the client validates responses with them, branding kobo at the edge.
- **React 18 vs shadcn v4 (the big catch):** shadcn v4 components are React-19-style (ref as a plain
  prop). On React 18 the ref is dropped silently, so `PopoverTrigger asChild` had no anchor and the
  settings popover rendered at (0, −862px) — found only by screenshotting the running app; unit tests
  and axe were green. Converted `Button` and `Input` to `forwardRef` and added a ref-forwarding test.
  The same bug would have broken react-hook-form's `register` in Phase 5.
- Seed flakiness: with a 15% chance over ~18 recent rows, seed 42 produced zero `pending` rows and two
  tests failed. Fixed the data design (recency skew + guaranteed pending rows per type), not the test.
- The Write tool JSON-decodes `\uXXXX` escapes, so hostile strings (RTL override, NUL) landed in the
  source as literal invisible characters. Added `tests/source-hygiene.test.ts` (Trojan Source guard)
  so this class of mistake fails CI.
- Playwright: `addInitScript` re-runs on reload and clobbered the config the panel had persisted. The
  fixture now seeds once per tab. Also: `page.goto` resolves before MSW's worker is active; the
  `gotoApp` fixture waits for the shell, which only renders after `worker.start()` resolves.
- Lint's `prefer-nullish-coalescing` suggested `??` for a `narration || fallback` — wrong for empty
  strings. Normalised `''` → `undefined` first so `??` is actually correct.

## Phase 4 — balance + feed

- Chose native `<input type="date">` and a styled native `<select>` over shadcn Calendar/Radix Select:
  OS pickers on low-end Android, zero JS for keyboard/SR support, and −2 dependencies. Removed
  `calendar.tsx`, `react-day-picker`, `date-fns`.
- Sanitizer test caught a real bug in my truncation: slicing UTF-16 units then `Array.from` does not
  repair a split surrogate pair. Rewrote to truncate by code points.
- RTK's infinite-query _hook_ does not expose `isFetchNextPageError` (the selector type does). Derived
  it as `isError && rows.length > 0`, which also covers a failed background refetch.
- `feedFilters.ts` vs `FeedFilters.tsx` collided on macOS's case-insensitive FS (TS1149). Renamed the
  model to `filterModel.ts` — this would have been an "it works on my machine" bug on Linux CI.
- `react-hooks/refs` (v7) rejected reading `listRef.current.offsetTop` during render for the
  virtualizer's `scrollMargin`; moved it to state set in a layout effect.
- jsdom reports 0px boxes, which would make the virtualizer think every row fits (and auto-load every
  page). `measureElement` falls back to the estimate when it measures 0.
- `role="list"` on `<ul>` is flagged redundant by jsx-a11y, but Tailwind's preflight resets
  `list-style`, and Safari/VoiceOver then drops list semantics. Kept the role with a justification.
- `findByRole('status')` matched the loading skeleton (also `role=status`) instead of the empty state —
  two failing tests that were selector bugs, not app bugs.
- Node's fetch under jsdom rejects relative URLs; `fetchBaseQuery` now gets an absolute `baseUrl`
  built from `location`, identical in the browser.
- Re-render isolation is asserted by a `<Profiler>` test: refetching the balance commits zero renders
  inside the feed subtree.

## Phase 7 — resilience

- GET retry lives in the base query, not RTK's `retry()` helper: that helper retries every error
  including 4xx/5xx and mutations. Ours retries network errors only, GET only, and the status poll
  opts out (`extraOptions: { maxRetries: 0 }`) so two backoff loops never stack.
- The new retry immediately broke a Phase 6 test that faulted the name enquiry _once_ — the retry
  recovered, which is the desired behaviour; the test now exhausts the budget (3 failures).
- Offline is a real network condition in e2e (`context.setOffline`), not a mocked flag; the unit
  test mocks `navigator.onLine` + events. `navigator.onLine` is only ever used to block _starting_ a
  transfer and to show a banner — never to decide an outcome.
- "Route-level" code splitting: single-route app, so the split is at the feature boundary (Send
  Money chunk 31 KB gz, dev panel excluded from prod). Adding a router for one route would cost
  more bytes than it saves.
- Contrast is a test, not a checklist: axe with colour-contrast enabled, both themes, 360/768/1440,
  across dashboard, dialog steps, validation errors, offline banner and the confirming state.
  One unreproduced failure (3 "serious" nodes at light/360 on the first run; 0 in ~10 reruns) —
  the scan now prints rule id + target so a recurrence is self-explanatory.
- Storybook cut on purpose (Phase 0 plan): large install, no assessment weight vs. the above.
