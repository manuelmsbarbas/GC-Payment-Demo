/**
 * End-to-end API smoke test.
 * Runs against the local server (must be running on port 3001).
 *
 * Usage: npm test
 */

const BASE = 'http://localhost:3001';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

let passed = 0;
let failed = 0;

function ok(label: string, detail?: string) {
  passed++;
  console.log(`${GREEN}  ✓${RESET} ${label}${detail ? `  ${YELLOW}${detail}${RESET}` : ''}`);
}

function fail(label: string, err: unknown) {
  failed++;
  const msg = err instanceof Error ? err.message : String(err);
  console.log(`${RED}  ✗ ${label}${RESET}`);
  console.log(`    ${RED}${msg}${RESET}`);
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json()) as T;
  if (!res.ok) {
    const msg = (data as { error?: string }).error ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  const data = (await res.json()) as T;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return data;
}

async function run() {
  console.log('\nGoCardless API — smoke test\n');

  // ── Health ────────────────────────────────────────────────────────────────
  console.log('Health');
  try {
    const health = await get<{ status: string }>('/health');
    if (health.status !== 'ok') throw new Error(`Unexpected status: ${health.status}`);
    ok('GET /health');
  } catch (err) {
    fail('GET /health', err);
    console.log(`\n${RED}Server is not running. Start it with: cd server && npm run dev${RESET}\n`);
    process.exit(1);
  }

  // ── Billing request flow ──────────────────────────────────────────────────
  console.log('\nBilling request flow');

  let billingRequestId = '';
  let mandateId = '';

  // Step 1 — Create
  try {
    const br = await post<{ id: string; status: string }>('/billing-requests');
    billingRequestId = br.id;
    ok('POST /billing-requests', br.id);
  } catch (err) {
    fail('POST /billing-requests', err);
    summarise();
    return;
  }

  // Step 2 — Customer details
  try {
    await post(`/billing-requests/${billingRequestId}/collect-customer-details`, {
      given_name: 'Test',
      family_name: 'User',
      email: 'test@example.com',
      address_line1: 'Unter den Linden 1',
      city: 'Berlin',
      postal_code: '10117',
      country_code: 'DE',
    });
    ok('POST /billing-requests/:id/collect-customer-details');
  } catch (err) {
    fail('POST /billing-requests/:id/collect-customer-details', err);
  }

  // Step 3 — Bank account
  try {
    await post(`/billing-requests/${billingRequestId}/collect-bank-account`, {
      account_holder_name: 'Test User',
      iban: 'DE89370400440532013000',
      country_code: 'DE',
    });
    ok('POST /billing-requests/:id/collect-bank-account');
  } catch (err) {
    fail('POST /billing-requests/:id/collect-bank-account', err);
  }

  // Step 4 — Confirm payer
  try {
    await post(`/billing-requests/${billingRequestId}/confirm-payer-details`);
    ok('POST /billing-requests/:id/confirm-payer-details');
  } catch (err) {
    fail('POST /billing-requests/:id/confirm-payer-details', err);
  }

  // Step 5 — Fulfil
  try {
    const fulfilled = await post<{ id: string; links: { mandate_request_mandate?: string } }>(
      `/billing-requests/${billingRequestId}/fulfil`
    );
    mandateId = fulfilled.links.mandate_request_mandate ?? '';
    if (!mandateId) throw new Error('No mandate ID in response');
    ok('POST /billing-requests/:id/fulfil', mandateId);
  } catch (err) {
    fail('POST /billing-requests/:id/fulfil', err);
    summarise();
    return;
  }

  // ── Subscription ──────────────────────────────────────────────────────────
  console.log('\nSubscription');

  try {
    const sub = await post<{ id: string; status: string; amount: number; currency: string }>(
      '/subscriptions',
      { mandate_id: mandateId }
    );
    ok('POST /subscriptions', `${sub.id}  ${sub.amount / 100} ${sub.currency}/month`);
  } catch (err) {
    fail('POST /subscriptions', err);
  }

  summarise();
}

function summarise() {
  const total = passed + failed;
  console.log(`\n${passed}/${total} passed`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
