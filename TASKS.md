# Pending Tasks

## 1. Remove IBP/Instant+DD callback polling — replace with graceful async state

**File**: `client/src/components/HostedCallbackModal.tsx`

Current behaviour: polls `GET /billing_requests/:id` up to 10 times (2 s apart) waiting for
`payment_request_payment` / `mandate_request_mandate` to be populated, then shows an error if
they never appear.

Desired behaviour:
- Do **one** attempt to read the billing request on callback.
- If the link is already present (common case) → proceed as today.
- If not → show a neutral "Payment is processing — it will appear in Payments History once
  confirmed" message and close cleanly. No error shown, since the payment is genuinely in
  flight and will surface via the SSE → history table update.

---

## 2. Fix "Unknown" customer name on Hosted / Drop-In flows

**File**: `server/src/routes/billingRequests.ts`

Root cause: for Hosted and Drop-In flows the server never calls
`collect-customer-details`, so `temp:br:{brId}` is never written to Redis. The fallback
`'Unknown'` is used everywhere for those flows.

Fix: the fulfilled billing request response from GoCardless includes a
`resources.customer` object (`given_name`, `family_name`, `email`). Read those fields
directly from the GC response and use `temp:br` only as a fallback. Requires expanding the
`BillingRequestResponse` type to include the nested `resources.customer` shape.

---

## 3. Instant+DD — create subscription via webhook (Option A)

**Files**:
- `server/src/routes/hosted.ts` — store sub config in Redis at flow-start time
- `server/src/services/redisStore.ts` — extend `saveTempBrDetails` (or add a new helper) to
  persist sub config fields alongside name/email
- `server/src/queues/webhookWorker.ts` — in `handleBillingRequest`, when
  `billing_requests.fulfilled` fires for an Instant+DD flow (both `payment_request_payment`
  AND `mandate_request_mandate` present), read the stored sub config from Redis and call
  `gcFetch` to `POST /subscriptions`, then `upsertSubscription`

Why Option A over client-side: works even if the user closes the browser tab after bank
authorisation, making the demo resilient to the full async path.

---

## 4. Update CLAUDE.md

After the above are implemented, update CLAUDE.md to reflect:
- Removal of polling in `HostedCallbackModal`
- `resources.customer` used as primary name/email source in the billing request callback
- Sub config stored in `temp:br` for Instant+DD hosted flows
- Subscription creation moved to `handleBillingRequest` in the webhook worker
