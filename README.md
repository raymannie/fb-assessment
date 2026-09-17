# NovaBiz Merchant Dashboard

Take-home for FirstBank Digital Factory — Frontend Engineer, Web (React).

A small merchant's view of their NovaBiz wallet: live balance with today's inflow/outflow, a
virtualized transaction feed with filters, and a four-step Send Money flow whose optimistic update
reconciles correctly when the (mocked) network fails **or goes silent**. There is no backend; the API
is served by MSW in every environment, with configurable latency, failure and timeout behaviour.

- **Run:** `npm install && npm run dev` (Node ≥ 22)
- **Tests:** 315 unit/component tests (Vitest + RTL + vitest-axe), 40 Playwright runs across desktop
  1440 px and mobile 360 px (incl. axe with colour contrast in both themes at 360/768/1440)
- **Try the failure modes:** click the ⚙ button (bottom-right, dev only) → _Flaky_ / _Timeouts_ presets

---

## Contents

1. [Running and testing](#1-running-and-testing)
2. [Architecture](#2-architecture)
3. [Key decisions and alternatives rejected](#3-key-decisions-and-alternatives-rejected)
4. [Money handling](#4-money-handling)
5. [Send Money reconciliation](#5-send-money-reconciliation)
6. [Accessibility](#6-accessibility)
7. [Security and NDPA](#7-security-and-ndpa)
8. [Mock API](#8-mock-api)
9. [Assumptions](#9-assumptions)
10. [Trade-offs](#10-trade-offs)
11. [What I'd do with more time](#11-what-id-do-with-more-time)

---

## 1. Running and testing

```bash
npm install
npm run dev            # http://localhost:5173 — MSW worker starts before first render
npm run build          # typecheck + production build (MSW included: there is no backend)
npm run preview        # serve the production build
```

| Script              | What it runs                                                                       |
| ------------------- | ---------------------------------------------------------------------------------- |
| `npm test`          | Vitest: jsdom, MSW node server, Testing Library, vitest-axe                        |
| `npm run test:e2e`  | Playwright: `desktop-chromium` (1440×900) and `mobile-360` (Pixel 5 @ 360 px)      |
| `npm run typecheck` | `tsc -b` — `strict`, `noUncheckedIndexedAccess`                                    |
| `npm run lint`      | ESLint 9 flat config: type-aware rules, jsx-a11y, `dangerouslySetInnerHTML` banned |
| `npm run format`    | Prettier                                                                           |

First e2e run needs a browser: `npx playwright install chromium`. E2E starts its own dev server on
port 5175 and never reuses one it didn't start (a stray server on 5173 once made an axe test "pass"
against another project's login page).

Copy `.env.example` to `.env.local` to change mock latency/failure defaults, client timeouts, or to
disable the mock worker (`VITE_ENABLE_MSW=false`). The same knobs are editable at runtime in the
dev settings panel (persisted in `sessionStorage` for the tab).

### Exercising the hard cases by hand

1. ⚙ → **Timeouts** preset (`transferTimeoutRate = 1`, mode _committed_) → send money. The request
   never returns; the UI marks the row "Confirming…", shows a banner, polls, and resolves to success
   without a second debit. Switch mode to _Dropped_ to see the "bank never received it" path with a
   full rollback and a safe retry on the **same** Idempotency-Key.
2. ⚙ → **Flaky** preset → watch reads retry with backoff, and a transfer fail with a rollback.
3. DevTools → Network → Offline: banner appears, Send Money's Confirm is disabled with a message.

---

## 2. Architecture

```mermaid
flowchart LR
  subgraph UI["React 18 (Vite)"]
    Shell[App shell<br/>banners · live regions · CTA]
    Balance[BalanceCard]
    Feed[TransactionFeed<br/>@tanstack/react-virtual]
    SM[Send Money dialog<br/><i>lazy chunk</i><br/>RHF + zod steps]
  end

  subgraph Store["Redux Toolkit store"]
    RTKQ[(RTK Query cache<br/>balance · transactions∞ · transfers · recipients)]
    Slices[(client slices<br/>sendMoney · announcer · theme)]
  end

  subgraph Reconcile["Reconciliation (pure)"]
    Machine[reconcile(submission, event)<br/>→ next state + effects]
  end

  subgraph Mock["MSW (browser worker / node server)"]
    Handlers[handlers<br/>/balance /transactions<br/>/transfers /recipients]
    DB[(seeded in-memory db<br/>1,600 rows · idempotency store)]
    Cfg[runtime config<br/>latency · failure · timeout]
  end

  Balance & Feed & SM --> RTKQ
  SM --> Slices
  RTKQ -- onQueryStarted --> Machine
  Machine -- effects: patch/undo cache,<br/>announce, schedule poll --> RTKQ
  RTKQ -- fetch --> Handlers
  Handlers --> DB
  Cfg -.-> Handlers
  Shell --> Slices
```

### State boundaries

| Where                 | What                                                                          | Why                                                                                                                                              |
| --------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **RTK Query**         | balance, transaction pages, transfer create/status, name enquiry              | Server state: caching, dedupe, tags, request flags, and `onQueryStarted` gives optimistic patch/undo primitives                                  |
| **`sendMoney` slice** | draft, Idempotency-Key + fingerprint, the in-flight `submission` record       | Must outlive the dialog: the poll loop and the "confirming" lock keep working after the sheet is closed; Redux DevTools shows the whole timeline |
| **`announcer` slice** | current polite / assertive message                                            | One pair of live regions mounted in `Providers` before anything can announce                                                                     |
| **`theme` slice**     | light / dark / system                                                         | Only client preference; mirrored to `localStorage` — the **only** thing stored there                                                             |
| **URL search params** | feed filters (`from`, `to`, `status`, `type`)                                 | Shareable, back-button friendly, contains no PII                                                                                                 |
| **Local state**       | react-hook-form field values per step, popover open flags, virtualizer scroll | Ephemeral; committed to the slice on step advance so Back/Next and close/reopen preserve values                                                  |

### Folder layout

```
src/
  api/          baseApi (fetchBaseQuery + GET retry) and one file per domain; transfers.ts holds the reconciliation orchestrator
  app/          store, typed hooks, providers
  components/   AsyncState, Money, StatusBadge, AppHeader; ui/ = shadcn primitives (forwardRef'd for React 18)
  features/     balance, transactions, send-money (steps, slice, pure state machine), a11y, connectivity, theme
  lib/          money/ (kobo, parse, format, sum), sanitize, mask, date (Lagos), retry, urlSearch, limits
  mocks/        MSW handlers, seed, db, cursor, config, DevSettingsPanel
  types/        API contract as zod schemas (types inferred)
e2e/            Playwright specs + fixtures
tests/          source-hygiene test (no invisible/bidi characters in source)
```

### Re-render isolation

`BalanceCard` and `TransactionFeed` are siblings with their own RTK hooks; nothing above them
subscribes to both caches. Rows are `React.memo` on **primitive props**. A balance refetch commits
`BalanceCard` only — asserted by a `<Profiler>` test that refreshes the balance and expects zero
commits inside the feed subtree.

---

## 3. Key decisions and alternatives rejected

| Decision                 | Chosen                                                                             | Rejected and why                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Server state**         | RTK Query                                                                          | **React Query** would do the fetching equally well, but the optimistic update here has to touch _several_ cache entries (balance + every filtered feed page) and stay consistent with a client-side submission record; RTK Query's `updateQueryData`/`selectCachedArgsForQuery` plus one Redux store for the submission makes that one coherent system with one DevTools timeline. **Zustand** would cover the client state but not caching/dedupe/tags. |
| **Feed pagination**      | RTK Query `infiniteQuery` (2.6+) with a server keyset cursor                       | Offset paging: a new transfer at the head shifts and duplicates rows on the next page. The old `serializeQueryArgs`/`merge` pattern: superseded, and `hasNextPage`/`fetchNextPage` come for free now.                                                                                                                                                                                                                                                    |
| **Virtualization**       | `@tanstack/react-virtual` (window scroll, `measureElement`)                        | `react-window` needs fixed or pre-measured row heights; our rows change height between the mobile card and the desktop row, and description lines wrap. tanstack measures the DOM and is ~4 KB gz.                                                                                                                                                                                                                                                       |
| **Mock API**             | MSW v2 — same handlers in the browser worker, in Vitest's node server, and in prod | A json-server/Express mock is a second process and a different code path in tests; MSW intercepts real `fetch`, so RTK Query, timeouts and abort behave exactly as they would against a real API. It runs in the production build too, because there is no backend.                                                                                                                                                                                      |
| **Forms**                | react-hook-form + zod, one schema per step                                         | Uncontrolled inputs (fewer renders on low-end devices), and the amount schema wraps `parseNairaInputToKobo` so the form and the money rules can't disagree.                                                                                                                                                                                                                                                                                              |
| **Date/select controls** | Native `<input type="date">` and a styled native `<select>`                        | shadcn Calendar / Radix Select: heavier, and native controls get the OS picker on Android with zero JS for keyboard/screen-reader support. Two dependencies fewer.                                                                                                                                                                                                                                                                                       |
| **Router**               | None                                                                               | One route. Filters use `URLSearchParams` behind `useSyncExternalStore`; Send Money is a lazy dialog. A router would add bytes to "split" a single route.                                                                                                                                                                                                                                                                                                 |
| **Tooling versions**     | React 18 (fixed by the brief's stack), ESLint 9, Vitest 5, Vite 7                  | ESLint 10 is blocked by `eslint-plugin-jsx-a11y`'s peer range; Vitest 4.1 crashes npm 10's resolver and 4.0 carries an advisory; Vitest 5 installs clean on stock npm.                                                                                                                                                                                                                                                                                   |
| **Storybook**            | Not included                                                                       | Large install, no assessment weight next to the reconciliation and test work; the components are small and covered by RTL tests.                                                                                                                                                                                                                                                                                                                         |

---

## 4. Money handling

Money is an integer number of kobo everywhere — state, API payloads, arithmetic — typed as
`Kobo = number & { __brand: 'Kobo' }` and validated at the API boundary by zod (`z.int().nonnegative()`),
so the brand is earned, not asserted.

- **Parsing** (`lib/money/parse.ts`): `"1,000.50"` → split on `.`, at most two decimals, combined with
  **BigInt** (`whole * 100n + fraction.padEnd(2, '0')`), rejected above `Number.MAX_SAFE_INTEGER`.
  ASCII digits only. Never `parseFloat(x) * 100` — `19.99 * 100 === 1998.9999999999998`.
- **Formatting** (`lib/money/format.ts`): `100050` → `"1000.50"` by string slicing (no division), then
  one cached `Intl.NumberFormat('en-NG', { currency: 'NGN' })`, which accepts a decimal **string** and
  formats it exactly. Output is used verbatim. `₦1,000.50`, `-₦1,000.50`, `+₦…` for deltas.
- **Arithmetic**: `addKobo`/`subtractKobo`/`sumKobo` throw `RangeError` past the safe range instead of
  returning an imprecise total.
- 110 table-driven tests including `0`, `1`, `99`, `100`, `100050`, negatives, `MAX_SAFE_INTEGER`,
  `".5"`, `"5."`, `"1.999"` (rejected), `"-5"` (rejected), non-ASCII digits (rejected).
- **ICU note**: `en-NG` with full ICU yields `₦` and ASCII separators. Small-ICU Node builds fall back
  to `NGN 1,000.50` with a non-breaking space; the suite has a preflight test that says so plainly.

---

## 5. Send Money reconciliation

The flow is recipient → amount → review → confirm. The **Idempotency-Key** (`crypto.randomUUID()`)
is minted on entering Review and bound to a fingerprint of `(account, bank, amount, narration)`; it is
reused for every retry and regenerated only when the fingerprint changes. The mock returns the
original transfer for a replayed key (no second debit) and `409` for a reused key with a different
payload.

`features/send-money/reconciliation.ts` is a **pure state machine**: `reconcile(submission, event)`
returns the next state and a list of _effects_ (plain data). `api/transfers.ts` executes effects
against the RTK Query cache, the live regions and a poll timer.

```
submitting ──2xx──────────────────────────────▶ succeeded
    │
    ├─definite (any response with an ApiError body)─▶ failed ──retry (same key)──▶ submitting
    │
    └─UNKNOWN (timeout / network / gateway 5xx)──▶ confirming ──poll──┬─ successful ─▶ succeeded
                                                       ▲             ├─ failed     ─▶ failed
                                                       │             ├─ 404        ─▶ failed ("not received", retry is safe)
                                                       │             ├─ pending/err ─▶ confirming (backoff 1→2→4→8 s ±20 %, 6 tries)
                                                       └─check status─ unresolved ◀─┘ budget exhausted
```

Cache patches, in order:

| Event                        | Balance cache                          | Feed caches (every filter variant that would include the row) | Also                                     |
| ---------------------------- | -------------------------------------- | ------------------------------------------------------------- | ---------------------------------------- |
| submit                       | `available −= amount` (patch kept)     | insert optimistic `pending` row at the head (patches kept)    | polite "Sending ₦X to NAME…"             |
| 2xx / poll `successful`      | `available = balanceAfter`; invalidate | replace optimistic row with the server row where it belongs   | polite "Sent…", toast                    |
| definite / poll failed / 404 | **undo**; invalidate                   | **undo**                                                      | assertive "Transfer failed: …", Retry    |
| unknown                      | untouched                              | untouched (badge → "Confirming…")                             | polite notice, banner, global lock, poll |
| unresolved                   | untouched                              | untouched (badge → "Unconfirmed")                             | assertive warning, "Check status"        |

Guarantees: the Confirm button is disabled while active, the reducer refuses a second active
submission (so a double-click sends exactly one request), and nothing is ever rolled back while the
outcome is unknown. The feed is **patched, not invalidated**, on success: an infinite query refetches
every loaded page in sequence, which is seconds of traffic on 3G for no new information.

Both a broken undo (`patch.undo()` never called) and a broken state machine (`UNDO_OPTIMISTIC`
omitted) were tried deliberately: the first fails 3 unit + 4 e2e tests, the second 6 unit tests.

---

## 6. Accessibility

- Fully keyboard operable; a Playwright test completes a transfer with the keyboard only on both
  viewports. Focus moves to the step heading on every step change (callback ref, because Radix
  portals its content one commit late).
- Every input has a `<label>`; errors are linked with `aria-describedby` and fields carry
  `aria-invalid`.
- One polite and one assertive live region, mounted for the app's lifetime. Transfer failures are
  announced assertively; progress politely. Toasts are decoration on top, never the only channel.
- Status is never colour alone: text + icon. All status/badge tints pass AA in both themes — asserted
  by axe with `color-contrast` on at 360/768/1440, light and dark, across dashboard, dialog steps,
  validation errors, the offline banner and the confirming state.
- Touch targets are 44 px on small screens (buttons, inputs, selects). Visible focus rings
  everywhere; skip link; `<section aria-labelledby>` landmarks; `role="list"` restored on the
  virtualized `<ul>` because Safari drops list semantics once `list-style` is reset.
- "Load more" is always rendered as a real button as the keyboard/screen-reader path to pagination;
  manual loads announce "Loaded 50 more. Showing 100 transactions."

---

## 7. Security and NDPA

- `dangerouslySetInnerHTML` is banned by an ESLint `no-restricted-syntax` rule (verified to fire).
- All merchant/customer text is rendered as text nodes through `lib/sanitize.ts`, which strips C0/C1
  controls, bidi overrides/isolates and zero-width characters, caps stacked combining marks and
  length (on a code-point boundary). It deliberately does **not** strip `<tags>` — React escapes them,
  and "`<img src=x onerror=…>`" shown literally is evidence, not a hole. The seed contains 14 hostile
  descriptions to prove this, including a right-to-left override and a 600-character string.
- Account numbers are masked by the API (`******4821`) before they reach any list; the full number
  exists only in the recipient form and the transfer request, never in logs, URLs or storage.
- `localStorage` holds only the theme. Mock config is `sessionStorage`. The Send Money draft and the
  in-flight submission live in memory only.
- A source-hygiene test fails CI if any source file contains invisible/bidi characters ("Trojan
  Source"); fixtures must spell them as `\uXXXX`.
- Data minimisation in the spirit of NDPA 2023: no analytics, no third-party requests, no PII in
  URLs. The name-enquiry result is shown only to the sender and only for the current draft.

---

## 8. Mock API

Endpoints (`src/types/api.ts` is the contract; zod schemas, types inferred):

| Endpoint                             | Notes                                                                                                                        |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/balance`                   | `available` (= ledger − pending debit holds), `ledger`, today's inflow/outflow computed server-side in **Africa/Lagos**      |
| `GET /api/transactions`              | keyset cursor (`base64url({createdAt, id, filtersHash})`), `limit` ≤ 100, `from`/`to` inclusive Lagos days, `status`, `type` |
| `POST /api/transfers`                | `Idempotency-Key` header required (UUID); replay → `200` + `Idempotent-Replayed: true`; mismatch → `409`; rules → `422`      |
| `GET /api/transfers/:idempotencyKey` | `200` or `404`                                                                                                               |
| `GET /api/recipients/resolve`        | deterministic name per (account, bank); numbers ending in `0` → `404` so the not-found state is demoable                     |

Errors share one shape: `{ error: { code, message, details?, requestId } }`. The seed is 1,600
deterministic rows (mulberry32) over 90 days, recency-skewed, with pending rows only in the last 24 h.

Runtime config (`⚙` panel / `VITE_MOCK_*` / e2e `useMockConfig`): latency range, read `failureRate`,
`transferFailureRate` (a `500` **with** a body = definite), `transferTimeoutRate` with
`timeoutMode` **committed** (debit happens, response withheld) or **dropped** (never arrived), plus
the client transfer timeout and poll base delay. Tests set these explicitly; nothing is random.

---

## 9. Assumptions

1. One authenticated merchant; no login, tiered KYC limits or transfer PIN in scope (see §11).
2. "Today" is the Africa/Lagos calendar day (UTC+1, no DST — a fixed offset is exact).
3. Today's inflow/outflow count `successful` transactions only; `available = ledger − pending debit holds`.
4. Amounts in the API are non-negative; sign is derived from `type`.
5. Per-transfer limits of ₦1.00 – ₦5,000,000.00 stand in for CBN tier limits; enforced by the mock and
   pre-checked by the client from a shared constant.
6. Transfers settle instantly (NIP). A `pending` transfer status is handled by the poll loop but not
   simulated by the seed.
7. `404` from the status endpoint is authoritative because the mock commits before withholding the
   response. In production a `404` inside the server's processing window is ambiguous — see §10.
8. The bank list is static (17 NIP codes).
9. In-flight submission state is not persisted across a page reload; the feed refetch still shows the
   truth. Persisting `{ key, amount }` to `sessionStorage` and resuming the poll is a small follow-up.

## 10. Trade-offs

- **Undo-by-inverse-patch can be stale** if a background refetch landed mid-flight. Every rollback
  therefore also invalidates `Balance`; the refetch repairs any drift.
- **The global "unresolved" lock** could strand a user if the status endpoint were down for long. For a
  money product that is the right default; the banner explains it and "Check status" is always there.
- **Feed patched rather than invalidated** on success trades a theoretical staleness (a server-side
  row that arrived between pages) for far less traffic; a manual refresh or filter change refetches.
- **Native date inputs** look less polished on desktop than a calendar popover; they are more usable on
  the target devices and cost nothing.
- **`navigator.onLine`** is a hint, so it only blocks _starting_ a transfer and shows a banner; it never
  decides an outcome.
- **Bundle**: main chunk ≈ 146 KB gz (React, RTK, zod, icons), Send Money ≈ 31 KB gz lazy, MSW ≈ 99 KB
  gz only when mocking. `zod/mini` would trim ~10 KB; not worth the API churn in this window.

## 11. What I'd do with more time

- **Real auth and session**: token refresh in the base query, `401` → re-auth, idle timeout.
- **Server-driven limits and fees**: `GET /limits` per merchant tier (KYC level), fee quote on Review.
- **2FA / transaction PIN** on the Confirm step, with the PIN never touching Redux or logs.
- **Pending settlement**: simulate NIP `pending → successful` so the poll's `pending` branch is exercised end-to-end, and a "transfer receipt" screen with share/download.
- **Persist in-flight state** (`{ key, amount, startedAt }` in `sessionStorage`) so a reload during
  "confirming" resumes polling rather than relying on the feed refetch.
- **Telemetry**: OpenTelemetry web traces for the transfer lifecycle (with `requestId`), Web Vitals,
  and an error boundary reporting to a sink — all with PII scrubbing.
- **i18n**: `Intl` is already locale-pinned; messages would move to ICU MessageFormat with Hausa, Igbo
  and Yoruba as first targets, and number/date formatting would follow the user's locale.
- **Feed extras**: search, CSV export (with formula-injection escaping — the seed already contains
  `=HYPERLINK(...)`), pull-to-refresh on mobile, and a filter for "my transfers".
- **Ops**: CI workflow (typecheck, lint, unit, e2e with the Playwright container), bundle-size budget
  check, Lighthouse CI for the 360 px profile.
