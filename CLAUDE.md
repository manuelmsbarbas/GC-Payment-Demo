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

**Stack**: Express 4, TypeScript 5, BullMQ 5, ioredis 5, ts-node-dev

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
| `POST /billing-requests` | Step 1 — create billing request (SEPA Core mandate) |
| `POST /billing-requests/:id/collect-customer-details` | Step 2 — attach customer info |
| `POST /billing-requests/:id/collect-bank-account` | Step 3 — attach IBAN |
| `POST /billing-requests/:id/confirm-payer-details` | Step 4 — confirm |
| `POST /billing-requests/:id/fulfil` | Step 5 — fulfil → returns mandate ID |
| `POST /subscriptions` | Step 6 — create 10 EUR/month subscription against mandate |
| `POST /webhooks` | Receive & enqueue GoCardless webhook events |
| `GET /events/stream` | SSE stream — pushes processed events to the UI |
| `GET /health` | Liveness probe |

**Currently implemented**: SEPA Direct Debit subscription flow only. All other payment types (One-off DD, Instalments, Instant Bank Pay, Instant + DD, VRP) and non-SEPA schemes (Bacs, BECS, ACH, PAD, Autogiro, Betalingsservice) need server-side routes before they can be demoed end-to-end.

**GoCardless client**: `src/services/gocardless.ts`
- `gcFetch<T>` wraps the sandbox API (`https://api-sandbox.gocardless.com`).
- Always sends `GoCardless-Version: 2015-07-06`.

**Webhook pipeline**:
1. `POST /webhooks` validates the HMAC-SHA256 signature (`Webhook-Signature` header) via `src/middleware/webhookSignature.ts`.
2. Events are bulk-enqueued to the `webhook-events` BullMQ queue (`src/queues/webhookQueue.ts`) — 3 attempts, exponential backoff.
3. `webhookWorker.ts` processes jobs (concurrency 5), dispatches to `handleMandate` / `handlePayment` / `handleSubscription`, then calls `webhookEmitter.broadcast(event)`.
4. `webhookEmitter` (`src/events/emitter.ts`) is a Node `EventEmitter` that bridges the worker to the SSE route.
5. The SSE route (`src/routes/sse.ts`) emits a heartbeat every 30 s to keep proxies alive.

## Client (`client/`)

**Stack**: React 18, TypeScript 5, Vite 5

### Layout

```
App (FilterProvider)
├── Header
├── Sidebar          — filter controls
└── Main
    ├── PaymentMethodGrid — 6 payment method cards
    └── WebhookEventFeed  — live SSE events
```

### Filter sidebar (`components/Sidebar.tsx`)

Three controls, all wired to `FilterContext`:

| Control | Type | Behaviour |
|---|---|---|
| Payment Flow | Toggle (Custom / Hosted) | Hides cards not available in the selected flow (e.g. VRP is Hosted-only) |
| Country | `<select>` grouped by scheme | Auto-sets Scheme and Currency |
| Scheme | Read-only display | Auto-derived from Country; shows `(auto)` label |

### Payment method cards (`components/PaymentMethodCard.tsx`, `components/PaymentMethodGrid.tsx`)

Six payment types are defined in `data/paymentMethods.ts`:

| ID | Name | Schemes | Flows |
|---|---|---|---|
| `one-off-dd` | One-off Direct Debit | All | Both |
| `subscription` | Subscriptions | All | Both |
| `instalment` | Instalments | All | Both |
| `instant-bank-pay` | Instant Bank Pay | GBP / EUR Instant | Both |
| `instant-plus-dd` | Instant + Direct Debit | GBP / EUR Instant | Both |
| `vrp` | Variable Recurring Payments | GBP only | Hosted only |

**Availability rules** (computed per selected scheme + country):
- Instant Bank Pay & Instant + DD: available for GB/Bacs, or SEPA countries with SEPA Instant support (AT, BE, EE, FI, FR, DE, IE, IT, LV, LT, LU, NL, PT, SI). **Not available for ES and other non-Instant SEPA countries.**
- VRP: GB/Bacs only.
- All other methods: always available.

Cards that are unavailable for the current filter combination are dimmed and show the reason inline.

### Flow modal (`components/FlowModal.tsx`)

Opened when "Try it →" is clicked on any available card. Behaviour by context:

- **SEPA + Subscription + Custom**: fully functional — runs the 6-step billing-request API flow and creates a 10 EUR/month subscription. Form is pre-filled from `testBankDetails.json`.
- **Any other scheme + Subscription + Custom**: form shown pre-filled, submit disabled with "Coming soon for [scheme]".
- **Any payment type other than Subscription**: form shown pre-filled, submit disabled with "Demo implementation coming soon".
- **Hosted flow selected**: notice shown explaining that hosted flows use a GoCardless-branded page; no API call made.

The modal tracks per-step status (`idle / loading / success / error`) with icons `○ ◌ ✓ ✗`.

### Bank account fields (`components/BankAccountFields.tsx`)

Renders different inputs depending on the selected country's `displayMode`:

- `"iban"` — single IBAN field (all SEPA countries).
- `"local"` — one input per local bank field (Bacs sort code + account, BECS BSB + account, ACH routing + account, etc.). If the entry also has an IBAN (e.g. SE, DK), it is shown as a read-only hint below the local fields.

### Filter context (`context/FilterContext.tsx`)

Provides `filters` (flowType, countryCode, scheme), `bankDetails` (the matching entry from `testBankDetails.json`), and setters. Defaults to **France / SEPA / Custom**.

`setCountry(countryCode)` looks up the entry in `testBankDetails.json` and auto-sets `scheme` from `entry.scheme`.

### Data files

| File | Purpose |
|---|---|
| `data/testBankDetails.json` | 30 entries — one per country/scheme combination. Each has `iban`, `displayMode`, `bankFields` (local format), `customerDefaults`, `supportsInstantBankPay`, `currency`. |
| `data/paymentMethods.ts` | Definitions for all 6 payment types including `checkAvailability(scheme, countryCode)` functions. |
| `types/filters.ts` | `FlowType`, `SchemeId`, `FilterState`, `BankDetails`, `BankField` types. |
| `types/api.ts` | Request/response shapes and `SubscriptionFlow` state type. |

**API client**: `src/api/client.ts` — thin typed wrappers around `fetch`. Calls `http://localhost:3001` directly (not via the Vite proxy).

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

To test webhooks locally, expose port 3001 with a tunnel (e.g. `ngrok http 3001`) and register `https://<tunnel>/webhooks` in the GoCardless sandbox dashboard. Use the GoCardless Scenario Simulators (Dashboard → Developers) to fire test events.

## No Tests

There is no test suite yet. Manual testing is done via the UI + GoCardless Scenario Simulators.
