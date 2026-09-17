# AI usage

<!-- DRAFT generated from notes/ai-log.md. Edit so it reflects what actually happened: tools you
     really used, prompts you really gave, and your own words. Remove this comment before submitting. -->

## Tools and what they did

| Tool                                          | Used for                                                                                                                                                                                                        |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Claude Code** (Anthropic, Opus-class model) | The bulk of implementation, driven phase by phase from written prompts (`PROMPTS.md`). Planning (architecture, API contract, reconciliation state machine), scaffolding, tests, and this README/AI_USAGE draft. |
| **`CLAUDE.md`** (project instructions)        | Non-negotiable rules I wrote up front — money in kobo, idempotency semantics, timeout = unknown outcome, a11y and NDPA constraints — so every generation started from the same guard-rails.                     |
| **React DevTools / Playwright screenshots**   | Human verification of what the model claimed: re-render isolation, layout at 360/768/1440, both themes. Several real bugs were only visible here (see below).                                                   |

<!-- TODO: add Copilot/Cursor/ChatGPT etc. if you used them, and remove anything you didn't. -->

The working agreement was: plan first and wait for approval on anything large; run
`typecheck && lint && test` after every phase; write tests alongside code; never add a dependency
without asking; and challenge the instructions rather than follow them blindly.

## How I directed it

Each phase was a written prompt with explicit acceptance criteria, e.g.

> _"Implement `src/lib/money` … Write the table-driven tests FIRST, then the implementation. Include
> these cases: `"19.99"`, `"0.1"`, `"1,000.50"`, `".5"`, `"1.999"` (reject), `"-5"` (reject) …
> Explain any `Intl.NumberFormat` output quirks and how tests handle them."_

> _"Before coding, show me the state machine and the exact sequence of cache patches, then wait."_

> _"Then deliberately break the rollback code and confirm at least one test fails; report which ones."_

The most valuable thing was the last pattern: making the model prove its own tests can fail.

## Where the plan changed because the model pushed back

In the kickoff I asked it to challenge `CLAUDE.md`. Three of its objections changed the design:

1. **Don't `invalidateTags(['Transactions'])` after a successful transfer.** An RTK `infiniteQuery`
   refetches every loaded page sequentially — seconds of traffic on 3G. Patch the server row into the
   cache instead and invalidate `Balance` only.
2. **The optimistic row must be inserted into every cached filter variant that would include it,**
   via `selectCachedArgsForQuery` — not "the" feed cache, which doesn't exist once filters are in play.
3. **Narration belongs in the Idempotency-Key fingerprint.** The original rule said "recipient or
   amount"; reusing a key with a changed narration would either replay the old transfer or `409`.
   The mock now returns `409 IDEMPOTENCY_CONFLICT` on a payload mismatch, and the client rotates the key.

It also asked for a `timeoutMode: committed | dropped` knob on the mock, because without a "dropped"
mode the `confirming → 404 → safe retry` path was untestable.

## Where the AI output was wrong or risky, and how I caught it

**1. React 18 vs shadcn v4 — refs dropped silently (the important one).**
The shadcn CLI now generates React-19-style components (`ref` as a plain prop). Under React 18 that
ref is discarded with no build error. Symptoms: the settings popover rendered at `y = −862px`
(Radix had no anchor), and react-hook-form's `register` would have failed to attach to `Input`.
Unit tests, lint and axe were all green — a **screenshot of the running app** caught it. Fix:
`forwardRef` on `Button`, `Input`, `DialogOverlay`, `DialogContent`, plus a ref-forwarding test.

**2. Rollback tests that couldn't fail.**
When I asked it to break the rollback deliberately, the first run was caught by only one unit test
and two e2e tests. The dropped-timeout tests still passed with rollback disabled because the balance
refetch masked the missing undo, and the feed assertion only checked that the badge no longer read
"Confirming…" — the stale row was still there, re-badged "Pending". The assertions were strengthened
to "the optimistic row itself is gone"; the same mutation now fails 3 unit + 4 e2e tests.

**3. Truncation that split a surrogate pair.**
The sanitizer's length cap sliced UTF-16 units then `Array.from`'d the result — which cannot repair a
split emoji. A test with `'🍊'.repeat(200)` caught the lone high surrogate before the ellipsis; the fix
truncates by code point.

**4. `\uXXXX` escapes turned into literal invisible characters.**
The tooling's JSON parameter decoding converted U+202E (right-to-left override) and U+0000 (NUL) in the
hostile seed strings into the _actual_ characters in source — a Trojan-Source-class hazard. Caught
when a lint rule flagged irregular whitespace in an unrelated regex. Added
`tests/source-hygiene.test.ts` so any invisible/bidi character in `src/` fails CI.

**5. Flaky-by-design seed data.**
The seed gave each recent row a 15 % chance of `pending`; for seed 42 that produced zero pending rows
and two tests failed. The model's first instinct was to loosen the tests; the right fix was the data
design (recency skew + a guaranteed minimum of pending rows per type).

**6. A lint auto-fix that would have been wrong.**
`prefer-nullish-coalescing` suggested `??` for `narration || fallback`. Empty string is not nullish;
the suggestion would have rendered a blank description. Normalised `''` → `undefined` first so `??`
is actually correct.

**7. A focus-management workaround that raced the tests.**
Focusing the step heading in `requestAnimationFrame` (to wait for Radix's portal) intermittently
stole focus _while user-event was still typing_, producing random amount-validation failures. The
real cause was that Radix mounts portal content one commit late; a callback ref that focuses on
attach is deterministic. The intermittent failures were the signal — three green runs in a row
became the bar for "fixed".

**8. Tests that encoded the pre-retry behaviour.**
Adding GET retry-with-backoff immediately broke four existing tests that faulted the network _once_
— because the retry rescued them. That was the feature working; the tests now exhaust the retry
budget. Worth noting because "all green" would have meant the retry wasn't wired.

Smaller ones: `feedFilters.ts` vs `FeedFilters.tsx` collided on macOS's case-insensitive filesystem
(a Linux-CI landmine, renamed); Playwright's `reuseExistingServer` attached to another project's dev
server on port 5173 and an axe scan "passed" against a login page (e2e now owns port 5175); jsdom
reports 0 px boxes, which would have made the virtualizer load all 1,600 rows in tests; both RTL and
Playwright role queries exclude the page behind an open modal (correct a11y behaviour — test helpers
opt into hidden elements).

## What I checked myself, every phase

- `npm run typecheck && npm run lint && npm test && npm run test:e2e` before moving on.
- Screenshots at 360 / 768 / 1440 in both themes.
- Read every diff in the reconciliation orchestrator and the money utilities line by line — the two
  places where a plausible-looking mistake costs real money.

<!-- TODO: add anything you did by hand that the model didn't (e.g. the final read-through, decisions
     you overruled), and delete anything above that overstates your involvement. -->
