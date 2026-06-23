# GoCardless API Demo

A sandbox demo app showcasing GoCardless payment flows across multiple schemes and countries. A filter sidebar lets you select the payment flow type, country, and scheme; the main canvas shows the relevant payment method cards and filters their availability in real time. Webhook events are streamed to the UI via Server-Sent Events.

## Architecture

Monorepo with two independent workspaces:

```
server/   — Express + TypeScript API (port 3001)
client/   — React 18 + Vite SPA (port 5173)
docker-compose.yml — Redis only (BullMQ backing store)
```

The Vite dev server proxies `/api/*` → `localhost:3001` (stripping the `/api` prefix). The client currently calls `http://localhost:3001` directly (bypassing the proxy) — all server routes are mounted without an `/api` prefix.

## Server (`server/`)

**Stack**: Express 4, TypeScript 5, BullMQ 5, ioredis 5, ts-node-dev, gocardless-nodejs 8

**Entry point**: `src/index.ts`
- Mounts `express.raw()` on `/webhooks` **before** `express.json()` — required for HMAC signature verification.
- Starts BullMQ worker on boot (`webhookWorker`).
- Handles `SIGTERM`/`SIGINT` for graceful shutdown.

**Config**: `src/config/env.ts`
- Reads from `server/.env` via dotenv.
- Throws at startup if `GC_ACCESS_TOKEN` or `GC_WEBHOOK_SECRET` are missing.

**Routes** (`src/routes/`):

| Route | Purpose |
|---|---|
| `GET /billing-requests/:id` | Read a billing request — used by all callbacks (DD Hosted, IBP Hosted, IBP Custom) to get `mandate_request_mandate` or `payment_request_payment` after GoCardless auto-fulfils |
| `POST /billing-requests` | Create billing request — accepts `{ scheme, currency }` for DD mandate flows (any scheme), `{ payment_type: 'payment', amount, currency }` for IBP (hardcoded `faster_payments`), or `{ payment_type: 'instant-plus-dd', amount, currency }` for combined IBP + Bacs mandate |
| `POST /billing-requests/:id/collect-customer-details` | Attach customer name, email, address |
| `POST /billing-requests/:id/collect-bank-account` | Attach bank account — forwards any fields sent by client (IBAN, `sort_code`+`account_number` for UK, etc.) |
| `POST /billing-requests/:id/confirm-payer-details` | Confirm payer details — **mandate requests only** (DD flows); do not call for IBP |
| `POST /billing-requests/:id/fulfil` | Fulfil → returns `mandate_request_mandate` (DD flows only); **not used for IBP** — GoCardless auto-fulfils IBP on bank authorisation |
| `GET /billing-requests/:id/institutions` | List available banks for an IBP billing request (FasterPayments only) |
| `POST /billing-requests/:id/select-institution` | Select the customer's bank for IBP — `{ institution, country_code }` |
| `POST /bank-authorisations` | Create a bank authorisation for IBP Custom — `{ billing_request_id }` → returns `{ id, url }`; `url` is where the customer is redirected to authorise in their banking app |
| `POST /subscriptions` | Create subscription against a mandate — accepts optional `amount`, `currency`, `name`, `interval`, `interval_unit` (defaults: 1000 / EUR / "Europa SEPA Subscription" / 1 / monthly) |
| `POST /payments` | Collect a one-off payment against a mandate (amount + currency from request body) |
| `POST /instalment-schedules` | Create instalment schedule against a mandate — supports both "with dates" (explicit per-instalment charge dates) and "with schedule" (interval + amounts array) modes |
| `POST /drop-in/start` | JS Drop-In only — accepts `{ scheme, currency, prefilled_customer? }`; creates a billing request + billing request flow for any DD scheme; `prefilled_customer` (name, email, address, country_code) is forwarded to the flow; returns `billing_request_flow_id` for the client to pass to the Drop-In component |
| `POST /hosted/start` | Hosted DD — accepts `{ scheme, currency, prefilled_customer? }`; creates a billing request + billing request flow for any DD scheme; `prefilled_customer` forwarded to the flow; `redirect_uri` is `CLIENT_ORIGIN/?gc_billing_request_id=<id>`; returns `{ authorisation_url, billing_request_id }` |
| `POST /hosted/ibp/start` | Hosted IBP — accepts `{ amount, currency, prefilled_customer? }`; creates a GBP/FasterPayments billing request + billing request flow; `prefilled_customer` forwarded to the flow; same redirect pattern as DD hosted; returns `{ authorisation_url, billing_request_id }` |
| `POST /hosted/instant-plus-dd/start` | Hosted Instant+DD — accepts `{ amount, currency, prefilled_customer?, subName?, subAmount?, subInterval?, subIntervalUnit? }`; creates a combined billing request (payment_request faster_payments + mandate_request bacs) + billing request flow; `prefilled_customer` forwarded to the flow; sub config stored in `temp:br:{brId}` Redis hash (1-hour TTL) for the webhook worker to use; same redirect pattern; returns `{ authorisation_url, billing_request_id }` |
| `POST /webhooks` | Receive & enqueue GoCardless webhook events |
| `GET /events/stream` | SSE stream — pushes processed events to the UI |
| `GET /history` | Return hierarchical payment history from Redis — all customers with their mandates, payments, subscriptions, and instalment schedules |
| `GET /health` | Liveness probe |

**Currently implemented**:
- **All DD schemes** (SEPA, Bacs, BECS, BecsNz, Autogiro, Betalingsservice, PAD, ACH): Subscription, One-off Direct Debit, Instalments — via Custom, JS Drop-In, and Hosted flows.
- **GBP / UK (FasterPayments + Bacs)**: Instant Bank Pay and Instant + Direct Debit — via Custom and Hosted flows.

**GoCardless clients** — two exist side by side:
- `src/services/gocardless.ts` — `gcFetch<T>` raw fetch wrapper; used by all billing-request/subscription/payment/instalment routes.
- `src/services/gcClient.ts` — `gocardless-nodejs` typed client (`Environments.Sandbox`); used exclusively by the Drop-In route.

**Redis persistence** (`src/services/redisStore.ts`):
Thin key/value cache for all created resources — used by the history route and webhook worker.

Key scheme: `customer:{id}`, `mandate:{id}`, `payment:{id}`, `subscription:{id}`, `instalment_schedule:{id}`. Index sets: `idx:customers`, `idx:mandates`, etc.

Temp storage for billing-request details before mandate ID is known: `temp:br:{brId}` — 1-hour TTL. Stores name/email (written by `collect-customer-details` on Custom flows) and/or sub config (written by `POST /hosted/instant-plus-dd/start`). Read and promoted when the billing request is fulfilled. Customer name: `resources.customer` from the GC response is used as the primary source; `temp:br` name/email is the fallback for Custom flows.

Functions: `upsertCustomer`, `upsertMandate`, `upsertPayment`, `upsertSubscription`, `upsertInstalmentSchedule`, plus `update*State` and relationship lookups (`getMandatesByCustomer`, `getPaymentsByMandate`, etc.). `getIbpPaymentsByCustomer` filters for payments of type `'ibp'` or `'instant-plus-dd'` (stored without a real mandate link).

Types are defined in `src/types/store.ts`:
- `StoredCustomer`, `StoredMandate`, `StoredPayment`, `StoredSubscription`, `StoredInstalmentSchedule`
- `HistoryMandate` / `HistoryCustomer` extend stored types with nested relationships
- `StoredPayment.type`: `'one-off-dd' | 'subscription-cycle' | 'instalment' | 'ibp' | 'instant-plus-dd'`
- `HistoryResponse` wraps `{ customers: HistoryCustomer[] }`

**Webhook pipeline**:
1. `POST /webhooks` validates the HMAC-SHA256 signature (`Webhook-Signature` header) via `src/middleware/webhookSignature.ts`.
2. Events are bulk-enqueued to the `webhook-events` BullMQ queue (`src/queues/webhookQueue.ts`) — 3 attempts, exponential backoff.
3. `webhookWorker.ts` processes jobs (concurrency 5), dispatches to `handleMandate` / `handlePayment` / `handleBillingRequest` / `handleSubscription` / `handleInstalmentSchedule`, updates Redis state via `redisStore`, then calls `webhookEmitter.broadcast(event)`.
4. `webhookEmitter` (`src/events/emitter.ts`) is a Node `EventEmitter` that bridges the worker to the SSE route.
5. The SSE route (`src/routes/sse.ts`) emits a heartbeat every 30 s to keep proxies alive.

**`handleBillingRequest`** handles `billing_requests.fulfilled` for IBP and Instant+DD flows:
- Seeds the customer and IBP payment into Redis (guarded by existence checks so it never overwrites data already seeded by the HTTP redirect callback).
- For hosted Instant+DD flows (identified by the presence of sub config in `temp:br:{brId}` — stored by `POST /hosted/instant-plus-dd/start`): reads the sub config and calls `POST /subscriptions` on GoCardless, then `upsertSubscription`. This makes subscription creation resilient to browser closes and async authorisation paths. Cleans up the `temp:br` key after the subscription is created.
- Customer name/email: `resources.customer` from the fulfilled billing request response is used as the primary source; `temp:br` name/email is the fallback.
- All other `billing_requests.*` actions are no-ops.

## Client (`client/`)

**Stack**: React 18, TypeScript 5, Vite 5

### Layout

```
App (FilterProvider)
├── Header
├── Sidebar          — filter controls + view switcher
└── Main
    ├── [explorer view] PaymentMethodGrid + WebhookEventFeed
    └── [history view]  PaymentsHistoryTable
```

`App.tsx` holds `view: AppView` state (`'explorer' | 'history'`). The Sidebar receives `view` and `onViewChange` and owns the switcher UI. `HostedCallbackModal` is mounted at the `App` level, triggered by the `gc_billing_request_id` query param.

### Filter sidebar (`components/Sidebar.tsx`)

Four controls:

| Control | Type | Behaviour |
|---|---|---|
| View switcher | 2-way toggle (Explorer / Payments History) | Switches the main canvas between the payment explorer and the history table |
| Payment Flow | 3-way toggle (Custom / JS Drop-In / Hosted) | Hides cards not available in the selected flow |
| Country | `<select>` grouped by scheme | Auto-sets Scheme and Currency |
| Scheme | Read-only display | Auto-derived from Country; shows `(auto)` label |

`AppView = 'explorer' | 'history'` is exported from `Sidebar.tsx`. `FlowType = 'custom' | 'js-drop-in' | 'hosted'` is in `types/filters.ts`.

Default country: **United Kingdom (GB)**.

### Payment method cards (`components/PaymentMethodCard.tsx`, `components/PaymentMethodGrid.tsx`)

Five payment types are defined in `data/paymentMethods.ts`:

| ID | Name | Schemes | Flows |
|---|---|---|---|
| `one-off-dd` | One-off Direct Debit | All DD schemes | All flows |
| `subscription` | Subscriptions | All DD schemes | All flows |
| `instalment` | Instalments | All DD schemes | All flows |
| `instant-bank-pay` | Instant Bank Pay | GBP (FasterPayments) only | Custom + Hosted only |
| `instant-plus-dd` | Instant + Direct Debit | GBP only | Custom + Hosted only |

**Availability rules** (computed per selected scheme + country):
- Instant Bank Pay: enabled for **GB only** (Custom + Hosted flows). Disabled for all other countries. Hidden on JS Drop-In tab.
- Instant + DD: enabled for **GB only** (Custom + Hosted flows). Disabled for all other countries. Hidden on JS Drop-In tab.
- All other methods (One-off DD, Subscription, Instalments): always available on all flows.

Cards that are unavailable for the current filter combination are dimmed and show the reason inline.

**API Details modal** (`ApiDetailsModal` — defined inside `PaymentMethodCard.tsx`): each card has an "API Details" button in the footer. Clicking it opens a modal popup showing the numbered sequence of API calls for that payment type. The sequence shown reflects the currently selected flow type. Close via the × button, the "Close" button, clicking the backdrop, or pressing Escape. The sequences are defined in `data/paymentMethods.ts` under `apiSteps: { custom: string[], 'js-drop-in': string[], hosted: string[] }` on each `PaymentMethodDef`.

### Flow modal (`components/FlowModal.tsx`)

Used for the **Custom** flow type. Opened when "Try it →" is clicked on any available card. The modal is a **multi-step wizard** — the user fills in details page by page.

**Wizard steps by payment type:**

| Payment type | Steps |
|---|---|
| Subscription | Customer Details → Bank Account → Review & Confirm |
| One-off DD | Customer Details → Bank Account → Payment Amount → Review & Confirm |
| Instalments | Customer Details → Bank Account → Instalment Schedule → Review & Confirm |
| Instant Bank Pay | Customer Details → Payment Amount → Select Institution → Review & Confirm |
| Instant + DD | Customer Details → Payment Amount → Subscription Config → Select Institution → Review & Confirm |

The wizard header shows **"Step X of Y"** with a description and `‹ ›` circle navigation buttons. The footer has **Back** and **Next →** buttons; on the Review step the button becomes **Confirm & Submit**.

For DD flows, all API calls run sequentially only after the final Review & Confirm step. For IBP and Instant+DD, API calls (create billing request + collect customer details + GET institutions) run automatically when the institution step becomes active — triggered by a `useEffect` that detects `ibpPrepareState === 'idle'` / `instantPlusDDPrepareState === 'idle'`, so it fires regardless of whether the user arrived via "Next →" or the `‹ ›` nav buttons. The institution picker shows a loading state while calls are in flight. The final Confirm button runs `selectInstitution` + `createBankAuthorisation` and redirects to `bankAuth.url`.

On confirm, the API steps run live with status icons `○ ◌ ✓ ✗`. A success banner appears when the final step completes; errors show an inline message and a "Start over" button.

**Functional behaviour by context:**

- **Any DD scheme + Subscription/One-off DD/Instalments + Custom**: fully functional — 6 API calls (create BR with `{ scheme, currency }` → collect customer → collect bank account → confirm payer → fulfil → create subscription/payment/instalment schedule). `collectBankAccount` spreads all `bankValues` so both IBAN-based (SEPA) and local-format fields (Bacs `sort_code`+`account_number`, BECS `bsb`+`account_number`, etc.) are sent correctly.
- **GB + Instant Bank Pay + Custom**: fully functional — `prepareIBP()` auto-triggers on the institution step (create IBP billing request → collect customer details → GET institutions; no bank account collection — the bank is identified via institution selection), then on confirm: select institution → create bank authorisation → redirect to bank's authorisation URL. GoCardless auto-fulfils the billing request when the customer authorises; on callback, `GET /billing-requests/:id` reads the payment ID.
- **GB + Instant + DD + Custom**: fully functional — `prepareInstantPlusDD()` auto-triggers on the institution step (creates combined billing request with both `payment_request` faster_payments + `mandate_request` bacs → collect customer details → GET institutions), then on confirm: select institution → create bank authorisation → save sessionStorage config (including subscription params) → redirect. GoCardless auto-fulfils on bank authorisation; on callback, `GET /billing-requests/:id` reads `mandate_request_mandate`, then `POST /subscriptions` creates the recurring subscription. `payment_request_payment` is read if available but not required — the instant payment completes asynchronously and is confirmed via webhook.
- **JS Drop-In flow**: handled by `DropInModal` instead (see below).
- **Hosted flow**: handled by `HostedModal` instead (see below).

**Important action differences — IBP / Instant+DD vs DD:**
- IBP billing requests use `payment_request` only (`scheme: 'faster_payments'`). Instant+DD billing requests use **both** `payment_request` (`scheme: 'faster_payments'`) and `mandate_request` (`scheme: 'bacs'`).
- `confirm_payer_details` is called for **Instant+DD** (Custom flow only) but NOT for pure IBP. Pure IBP has no `mandate_request` so the action doesn't exist on its billing request. Instant+DD has a `mandate_request`, so GoCardless adds `confirm_payer_details` as a required action and the billing request will not fulfil without it. GoCardless Hosted handles this internally; Custom flow calls it explicitly after `collect_customer_details`.
- `collect_bank_account` is **not called for IBP or Instant+DD** — the bank is identified through `select_institution`; Open Banking handles account extraction for the Bacs mandate automatically.
- Neither IBP nor Instant+DD calls `fulfil` — GoCardless auto-fulfils when the customer authorises in their banking app.
- On IBP callback: `GET /billing-requests/:id` → read `links.payment_request_payment`.
- On Instant+DD callback: `GET /billing-requests/:id` → read `links.mandate_request_mandate` (required, used to create the subscription); `links.payment_request_payment` may arrive asynchronously and is confirmed via webhook.

### Drop-In modal (`components/DropInModal.tsx`)

Used exclusively for the **JS Drop-In** flow type. Rendered by `PaymentMethodGrid` instead of `FlowModal` when `flowType === 'js-drop-in'` and the method is one of the three supported ones (`subscription`, `one-off-dd`, `instalment`).

**Phases** (in order):

| Phase | What happens |
|---|---|
| `config` | 2-step wizard (config → review) where the user sets payment parameters before the Drop-In launches |
| `launching` | Calls `POST /drop-in/start`, loads the Drop-In script |
| `dropping` | Drop-In overlay is active — component renders `null` to avoid competing UI |
| `completing` | Drop-In succeeded; creates subscription / payment / instalment schedule with user-configured values |
| `done` | Success banner + result IDs |
| `error` | Error message |

**Config wizard (Step 1 of 2) — fields per payment type:**

| Method | Fields |
|---|---|
| One-off DD | Amount (in selected currency) |
| Subscription | Plan name, Amount, Interval count ℹ, Interval unit ℹ (weekly / monthly / yearly) |
| Instalments | Schedule name, mode toggle (With Dates / With Schedule — default: With Dates); With Dates: per-instalment amount + charge date rows; With Schedule: start date ℹ, interval ℹ, frequency ℹ, amounts list ℹ |

ℹ = field has a hover tooltip explaining the parameter. Currency is derived from the selected country in the sidebar.

**Review step (Step 2 of 2):** summarises what will happen — Drop-In sets up the mandate, then the configured payment/subscription/schedule is created.

**How it works (after confirm):**
1. Calls `POST /drop-in/start` with `{ scheme, currency, prefilled_customer }` derived from the selected country → receives `billing_request_flow_id`. `prefilled_customer` is built from `bankDetails.customerDefaults` (address fields) plus hardcoded name/email (`Manuel Barbas`, `mbarbas@gocardless.com`) and the sidebar `countryCode`, so the customer step on the Drop-In overlay is pre-populated.
2. Dynamically loads the GoCardless Drop-In script (`https://pay.gocardless.com/billing/static/dropin/v2/initialise.js`).
3. Calls `GoCardlessDropin.create({ billingRequestFlowID, environment: 'sandbox', onSuccess, onExit })` then **`.open()`** — the Drop-In v2 API returns `{ open, exit }` and requires an explicit `.open()` call to show the overlay.
4. The Drop-In handles all customer details, bank account collection, mandate confirmation, and fulfilment as a full-screen overlay on the customer's page.
5. `onSuccess` receives the fulfilled billing request; the component extracts `links.mandate_request_mandate` and calls `/subscriptions`, `/payments`, or `/instalment-schedules` with the user-configured values from the wizard.
6. `onExit` (user closes without completing) dismisses the component.

**Double-submit guard**: a `useRef(false)` flag on the confirm button prevents re-entrant calls if the button is clicked twice before the phase state updates.

Supports all DD schemes — the `scheme` and `currency` from the sidebar selection are passed to `POST /drop-in/start`.

### Hosted modal (`components/HostedModal.tsx`)

Used when `flowType === 'hosted'` and the method is one of the five supported ones (`subscription`, `one-off-dd`, `instalment`, `instant-bank-pay`, `instant-plus-dd`). Rendered by `PaymentMethodGrid` instead of `FlowModal`.

**Phases:**

| Phase | What happens |
|---|---|
| `config` | 2-step wizard (config → review) — identical fields and UI to `DropInModal`; IBP shows amount input only; Instant+DD shows upfront amount + subscription config fields |
| `launching` | Calls `POST /hosted/start` (DD), `POST /hosted/ibp/start` (IBP), or `POST /hosted/instant-plus-dd/start` (Instant+DD) with `prefilled_customer` built from `bankDetails` context, stores config in `sessionStorage`, does `window.location.href = authorisation_url` |
| `error` | Error message if the start call fails |

On confirm, the full `HostedSessionConfig` (method, currency, all payment-specific fields) is written to `sessionStorage` under the key `gc_hosted_config` before the redirect so `HostedCallbackModal` can read it on return. For IBP, the config includes `{ methodId: 'instant-bank-pay', currency: 'GBP', amountInput }`. For Instant+DD, the config includes `{ methodId: 'instant-plus-dd', currency: 'GBP', amountInput, subName, subAmount, subInterval, subIntervalUnit }`.

**Supported**: all DD schemes (Subscription, One-off DD, Instalments) — `scheme` and `currency` from the sidebar are passed to `POST /hosted/start`. IBP and Instant+DD require GB. Non-GB IBP/Instant+DD disable the confirm button with a warning.

### Hosted callback modal (`components/HostedCallbackModal.tsx`)

Shown automatically by `App.tsx` when the URL contains `?gc_billing_request_id=` — i.e., when the user returns from the GoCardless hosted page or bank authorisation redirect. The callback handles five distinct cases, all identified via `sessionStorage` config.

**What it does on mount (auto-runs, no user click required):**
1. Reads `HostedSessionConfig` from `sessionStorage`.
2. **Step 1 — Read Billing Request**: one single `GET /billing-requests/:id` call — no polling.
   - **DD (Hosted)**: reads `links.mandate_request_mandate`. Throws if not present.
   - **IBP (Hosted or Custom)**: reads `links.payment_request_payment`. If not yet populated, shows a neutral "Payment is processing" message and closes cleanly — the payment will surface via SSE → history table.
   - **Instant+DD (Hosted)**: reads `links.mandate_request_mandate`. If not yet populated, same "processing" path as IBP. Subscription is created by the webhook worker (not the client).
   - **Instant+DD (Custom, `cfg.flow === 'instant-plus-dd-custom'`)**: reads `links.mandate_request_mandate`. If present, proceeds to Step 2 to create the subscription client-side.
3. **Step 2 — Create resource**: creates subscription / payment / instalment schedule using the config values. Skipped for: pure IBP (payment already created by GoCardless), and hosted Instant+DD (subscription created by webhook worker). Custom Instant+DD still creates the subscription here.
4. Shows live step tracker (`○ ◌ ✓ ✗`) + success banner or neutral processing message.

The Step 1 label is always "Read Billing Request" — all paths call `GET /billing-requests/:id` since GoCardless auto-fulfils in all cases.

A brief summary of what was configured (amount, frequency, name) is shown at the top of the modal.

On close: `window.history.replaceState({}, '', '/')` removes the query param and `sessionStorage.removeItem('gc_hosted_config')` clears the session (on success or processing; on error the user can retry by starting a new flow).

**`App.tsx`** reads `gc_billing_request_id` from the URL via a lazy `useState` initialiser and passes it to `HostedCallbackModal`. On close it calls `window.history.replaceState` and sets state to `null`.

### Payments history table (`components/PaymentsHistoryTable.tsx`)

Shown when `view === 'history'`. Fetches data from `GET /history` on mount and re-fetches on every incoming SSE webhook event. Also has a **↻ Refresh** button and a **last-updated timestamp** in the toolbar.

**Columns**: Name | ID | Type | Amount | State | Created

**Hierarchy** (three levels, all collapsible):

```
Customer   — Name: customer name  | ID: CU…  | Type: email
└── Mandate — Name: "Mandate"     | ID: MD…  | Type: scheme (e.g. SEPA_CORE, BACS)  — collapsed by default
    ├── Subscription  — Name: plan name   | ID: SB… | Type: "Subscription"  | Amount: £x/period
    ├── Instalment    — Name: sched name  | ID: IS… | Type: "Instalments"   | Amount: total
    └── Payment       — Name: "Payment"   | ID: PM… | Type: One-off DD / Subscription cycle / Instalment / etc.

Customer
└── IBP / Instant+DD Payment — directly under customer (no mandate row), same 6-column layout
```

Customers start expanded; mandates start collapsed with a summary line (`N resources · M failed`).

**Real-time updates**: an `EventSource` subscribes to `/events/stream`. On each webhook message, the component extracts the affected resource ID from `event.links` (mandate / payment / subscription / instalment_schedule) and briefly flashes that row yellow (`background: #fefce8`, 1500 ms) while refetching the full history.

**State badge colours**: green = active/paid_out/confirmed/completed/finished; blue = created/submitted/pending; red = failed/cancelled/expired/charged_back/errored; orange = paused.

**Payment type labels** (shown in the Type column): `'ibp'` → "Instant Bank Pay", `'instant-plus-dd'` → "Instant + DD", `'subscription-cycle'` → "Subscription cycle", `'instalment'` → "Instalment", `'one-off-dd'` → "One-off DD".

### Bank account fields (`components/BankAccountFields.tsx`)

Renders different inputs depending on the selected country's `displayMode`:

- `"iban"` — single IBAN field (all SEPA countries).
- `"local"` — one input per local bank field (Bacs sort code + account, BECS BSB + account, ACH routing + account, etc.). If the entry also has an IBAN (e.g. SE, DK), it is shown as a read-only hint below the local fields.

### Filter context (`context/FilterContext.tsx`)

Provides `filters` (flowType, countryCode, scheme), `bankDetails` (the matching entry from `testBankDetails.json`), and setters. Defaults to **United Kingdom / Bacs / Custom**.

`setCountry(countryCode)` looks up the entry in `testBankDetails.json` and auto-sets `scheme` from `entry.scheme`.

### Data files

| File | Purpose |
|---|---|
| `data/testBankDetails.json` | 30 entries — one per country/scheme combination. Each has `iban`, `displayMode`, `bankFields` (local format), `customerDefaults`, `supportsInstantBankPay`, `currency`. GB entry has `supportsInstantBankPay: true`. Bank field `key` values for local-format entries use GoCardless API snake_case field names (`sort_code`, `account_number`, `routing_number`, `institution_number`, `transit_number`, `bsb`, `bank_code`, `branch_code`, `account_suffix`, `swedish_identity_number`, `danish_identity_number`) so they can be spread directly into `collect_bank_account` requests. |
| `data/paymentMethods.ts` | Definitions for all 5 payment types including `checkAvailability(scheme, countryCode)` functions and `apiSteps` (Custom + JS Drop-In + Hosted call sequences). IBP availability checks `countryCode === 'GB'`. |
| `types/filters.ts` | `FlowType` (`'custom' \| 'js-drop-in' \| 'hosted'`), `SchemeId`, `FilterState`, `BankDetails`, `BankField` types. Also exports `SCHEME_API_ID: Record<SchemeId, string>` — maps display scheme names to GoCardless API scheme strings (e.g. `'SEPA' → 'sepa_core'`, `'Bacs' → 'bacs'`, `'BECS' → 'becs'`, `'BecsNz' → 'becs_nz'`, `'Autogiro' → 'autogiro'`, `'Betalingsservice' → 'betalingsservice'`, `'PAD' → 'pad'`, `'ACH' → 'ach'`). |
| `types/api.ts` | Request/response shapes (`BillingRequest`, `Payment`, `Subscription`, `InstalmentSchedule`, `Institution`, `BankAuthorisation`), flow state types (`IBPFlow` with `selectInstitution` + `createBankAuthorisation` steps; `InstantPlusDDFlow` with `createBillingRequest` + `collectCustomerDetails` + `selectInstitution` + `createBankAuthorisation` + `createSubscription` steps), request body types, `DropInStartResponse`, `HostedStartResponse`, and `HostedSessionConfig` (written to `sessionStorage` before redirect; includes optional `flow?: 'ibp-custom' \| 'instant-plus-dd-custom'` field). `CreateBillingRequestBody` is a union covering `payment` (IBP), `instant-plus-dd`, or `{ scheme, currency }` (DD mandate for any scheme). History types: `HistoryPayment`, `HistorySubscription`, `HistoryInstalmentSchedule`, `HistoryMandate`, `HistoryCustomer`, `HistoryResponse`. `WebhookEvent` interface (used by `PaymentsHistoryTable` to extract the affected resource ID from the SSE stream). |

**API client**: `src/api/client.ts` — thin typed wrappers around `fetch`. Calls the Railway server URL directly (not via the Vite proxy). Methods include: `getBillingRequest`, `getInstitutions`, `selectInstitution`, `createBankAuthorisation`, `hostedStart(scheme, currency, prefilled_customer?)`, `hostedIbpStart(amount, currency, prefilled_customer?)`, `hostedInstantPlusDDStart(amount, currency, prefilled_customer?)`, `dropInStart(scheme, currency, prefilled_customer?)`, `getHistory`, and all billing-request action methods. `PrefilledCustomer` type (exported from `types/api.ts`) carries `given_name`, `family_name`, `email`, `address_line1`, `city`, `postal_code`, `country_code`.

## Environment Variables

Copy `server/.env.example` to `server/.env` before starting:

| Variable | Required | Default | Notes |
|---|---|---|---|
| `GC_ACCESS_TOKEN` | yes | — | Sandbox token from GoCardless dashboard |
| `GC_WEBHOOK_SECRET` | yes | — | Webhook secret for HMAC verification |
| `REDIS_URL` | no | `redis://localhost:6379` | Must match Docker service |
| `PORT` | no | `3001` | Express listen port |
| `CLIENT_ORIGIN` | no | `http://localhost:5173` | CORS allowed origin |

## Running Locally

```bash
# 1. Start Redis
docker-compose up -d

# 2. Server
cd server && npm install && npm run dev

# 3. Client (separate terminal)
cd client && npm install && npm run dev
```

App opens at `http://localhost:5173`.

To test webhooks locally, expose port 3001 with a tunnel (e.g. `cloudflared tunnel --url http://localhost:3001` or `ngrok http 3001`) and register `https://<tunnel>/webhooks` in the GoCardless sandbox dashboard under **Developers → Webhooks**. Use the GoCardless Scenario Simulators (Dashboard → Developers → Scenario Simulators) to fire test events.

## No Tests

There is no test suite yet. Manual testing is done via the UI + GoCardless Scenario Simulators.
