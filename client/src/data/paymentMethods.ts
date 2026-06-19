import type { FlowType, SchemeId } from '../types/filters';

export type PaymentMethodId =
  | 'one-off-dd'
  | 'subscription'
  | 'instalment'
  | 'instant-bank-pay'
  | 'instant-plus-dd';

export interface AvailabilityResult {
  available: boolean;
  reason?: string;
}

export interface PaymentMethodDef {
  id: PaymentMethodId;
  name: string;
  tagline: string;
  description: string;
  bestFor: string[];
  flows: FlowType[];
  schemesLabel: string;
  docsPath: string;
  checkAvailability: (scheme: SchemeId, countryCode: string) => AvailabilityResult;
  apiSteps: {
    custom: string[];
    'js-drop-in': string[];
    hosted: string[];
  };
}

function ibpAvailability(_scheme: SchemeId, countryCode: string): AvailabilityResult {
  return countryCode === 'GB'
    ? { available: true }
    : { available: false, reason: 'Only available for GBP (United Kingdom)' };
}

export const PAYMENT_METHODS: PaymentMethodDef[] = [
  {
    id: 'one-off-dd',
    name: 'One-off Direct Debit',
    tagline: 'Ad-hoc variable-amount collection',
    description: 'Collect payments on an ad-hoc basis with varying amounts, frequency, and/or timing as agreed with the customer.',
    bestFor: ['Usage billing', 'Invoices', 'Variable charges'],
    flows: ['hosted', 'custom', 'js-drop-in'],
    schemesLabel: 'All schemes',
    docsPath: 'https://developer.gocardless.com/one-off-payments/one-off-direct-debit/',
    checkAvailability: () => ({ available: true }),
    apiSteps: {
      custom: [
        'POST /billing_requests — Create billing request with mandate_request',
        'POST /billing_requests/:id/actions/collect_customer_details — Attach customer name & email',
        'POST /billing_requests/:id/actions/collect_bank_account — Attach bank account (IBAN or local)',
        'POST /billing_requests/:id/actions/confirm_payer_details — Confirm payer details',
        'POST /billing_requests/:id/actions/fulfil — Fulfil request; creates mandate',
        'POST /payments — Collect one-off payment against the mandate',
        'Webhook: payments:created → payments:submitted → payments:paid_out',
      ],
      'js-drop-in': [
        'POST /billing_requests — Create billing request with mandate_request',
        'POST /billing_request_flows — Create flow; receive client_token for Drop-In',
        'Initialize GoCardless.js Drop-In with client_token — component mounts on your page',
        'Customer completes bank details within the embedded Drop-In component',
        'Handle onSuccess callback — receive mandate_id',
        'POST /payments — Collect one-off payment against the mandate',
        'Webhook: payments:created → payments:submitted → payments:paid_out',
      ],
      hosted: [
        'POST /billing_requests — Create billing request with mandate_request',
        'POST /billing_request_flows — Create hosted flow; receive authorisation_url',
        'Redirect customer to GoCardless-hosted payment page',
        'Customer enters bank details and confirms on GoCardless page',
        'POST /payments — Collect one-off payment against the mandate',
        'Webhook: payments:created → payments:submitted → payments:paid_out',
      ],
    },
  },
  {
    id: 'subscription',
    name: 'Subscriptions',
    tagline: 'Fixed recurring billing',
    description: 'Fixed amount collected automatically at regular intervals.',
    bestFor: ['SaaS', 'Memberships', 'Recurring billing'],
    flows: ['hosted', 'custom', 'js-drop-in'],
    schemesLabel: 'All schemes',
    docsPath: 'https://developer.gocardless.com/recurring-payments/subscriptions/',
    checkAvailability: () => ({ available: true }),
    apiSteps: {
      custom: [
        'POST /billing_requests — Create billing request with mandate_request',
        'POST /billing_requests/:id/actions/collect_customer_details — Attach customer name & email',
        'POST /billing_requests/:id/actions/collect_bank_account — Attach bank account (IBAN or local)',
        'POST /billing_requests/:id/actions/confirm_payer_details — Confirm payer details',
        'POST /billing_requests/:id/actions/fulfil — Fulfil request; creates mandate',
        'POST /subscriptions — Create recurring subscription against the mandate',
        'Webhook: mandates:created → subscriptions:created → payments:paid_out',
      ],
      'js-drop-in': [
        'POST /billing_requests — Create billing request with mandate_request',
        'POST /billing_request_flows — Create flow; receive client_token for Drop-In',
        'Initialize GoCardless.js Drop-In with client_token — component mounts on your page',
        'Customer completes bank details within the embedded Drop-In component',
        'Handle onSuccess callback — receive mandate_id',
        'POST /subscriptions — Create recurring subscription against the mandate',
        'Webhook: mandates:created → subscriptions:created → payments:paid_out',
      ],
      hosted: [
        'POST /billing_requests — Create billing request with mandate_request',
        'POST /billing_request_flows — Create hosted flow; receive authorisation_url',
        'Redirect customer to GoCardless-hosted page',
        'Customer enters bank details and confirms',
        'POST /subscriptions — Create recurring subscription against the mandate',
        'Webhook: mandates:created → subscriptions:created → payments:paid_out',
      ],
    },
  },
  {
    id: 'instalment',
    name: 'Instalments',
    tagline: 'Fixed payment plan over time',
    description: 'Fixed number of payments spreading the cost of a purchase.',
    bestFor: ['Payment plans', 'Tuition', 'High-ticket items'],
    flows: ['hosted', 'custom', 'js-drop-in'],
    schemesLabel: 'All schemes',
    docsPath: 'https://developer.gocardless.com/recurring-payments/instalments/',
    checkAvailability: () => ({ available: true }),
    apiSteps: {
      custom: [
        'POST /billing_requests — Create billing request with mandate_request',
        'POST /billing_requests/:id/actions/collect_customer_details — Attach customer name & email',
        'POST /billing_requests/:id/actions/collect_bank_account — Attach bank account (IBAN or local)',
        'POST /billing_requests/:id/actions/confirm_payer_details — Confirm payer details',
        'POST /billing_requests/:id/actions/fulfil — Fulfil request; creates mandate',
        'POST /instalment_schedules — Create fixed payment plan against the mandate',
        'Webhook: instalment_schedules:created → payments:paid_out (per instalment)',
      ],
      'js-drop-in': [
        'POST /billing_requests — Create billing request with mandate_request',
        'POST /billing_request_flows — Create flow; receive client_token for Drop-In',
        'Initialize GoCardless.js Drop-In with client_token — component mounts on your page',
        'Customer completes bank details within the embedded Drop-In component',
        'Handle onSuccess callback — receive mandate_id',
        'POST /instalment_schedules — Create fixed payment plan against the mandate',
        'Webhook: instalment_schedules:created → payments:paid_out (per instalment)',
      ],
      hosted: [
        'POST /billing_requests — Create billing request with mandate_request',
        'POST /billing_request_flows — Create hosted flow; receive authorisation_url',
        'Redirect customer to GoCardless-hosted page',
        'Customer enters bank details and confirms',
        'POST /instalment_schedules — Create fixed payment plan against the mandate',
        'Webhook: instalment_schedules:created → payments:paid_out (per instalment)',
      ],
    },
  },
  {
    id: 'instant-bank-pay',
    name: 'Instant Bank Pay',
    tagline: 'Seconds-fast one-off payment',
    description: 'One-off payment confirmed within seconds via the customer\'s banking app — no mandate required.',
    bestFor: ['E-commerce', 'Time-sensitive', 'High-value one-offs'],
    flows: ['hosted', 'custom'],
    schemesLabel: 'GBP · EUR (Instant)',
    docsPath: 'https://developer.gocardless.com/one-off-payments/instant-bank-payment/',
    checkAvailability: ibpAvailability,
    apiSteps: {
      custom: [
        'POST /billing_requests — Create billing request with payment_request (Instant scheme)',
        'POST /billing_requests/:id/actions/collect_customer_details — Attach customer details',
        'POST /billing_requests/:id/actions/select_institution — Customer selects their bank',
        'POST /billing_request_flows — Create redirect flow; receive authorisation_url',
        'Redirect customer to their banking app for authorisation',
        'Webhook: payments:confirmed → payments:paid_out (within seconds)',
      ],
      'js-drop-in': [
        'POST /billing_requests — Create billing request with payment_request (Instant scheme)',
        'POST /billing_request_flows — Create flow; receive client_token for Drop-In',
        'Initialize GoCardless.js Drop-In with client_token — bank selection shown in component',
        'Customer authorises instant payment in their banking app via the Drop-In',
        'Webhook: payments:confirmed → payments:paid_out (within seconds)',
      ],
      hosted: [
        'POST /billing_requests — Create billing request with payment_request (Instant scheme)',
        'POST /billing_request_flows — Create hosted flow; receive authorisation_url',
        'Redirect customer to GoCardless-hosted page (bank selection shown)',
        'Customer authorises payment in their banking app',
        'Webhook: payments:confirmed → payments:paid_out (within seconds)',
      ],
    },
  },
  {
    id: 'instant-plus-dd',
    name: 'Instant + Direct Debit',
    tagline: 'Instant upfront + recurring mandate',
    description: 'Immediate instant upfront payment via the customer\'s bank app, plus a direct debit mandate for future recurring payments.',
    bestFor: ['Immediate activation', 'Ongoing billing', 'Hybrid flows'],
    flows: ['hosted', 'custom'],
    schemesLabel: 'GBP · EUR (Instant)',
    docsPath: 'https://developer.gocardless.com/recurring-payments/instant-payment-with-direct-debit-setup/',
    checkAvailability: ibpAvailability,
    apiSteps: {
      custom: [
        'POST /billing_requests — Create billing request with payment_request (faster_payments) + mandate_request (bacs)',
        'POST /billing_requests/:id/actions/collect_customer_details — Attach customer details',
        'POST /billing_requests/:id/actions/select_institution — Customer selects their bank',
        'POST /bank_authorisations — Create bank authorisation; receive redirect URL',
        'Redirect customer to authorise instant payment + mandate in banking app',
        'GET /billing_requests/:id — Read payment_request_payment + mandate_request_mandate',
        'POST /subscriptions — Create recurring subscription against the mandate',
        'Webhook: payments:confirmed (instant) + mandates:created + subscriptions:created',
      ],
      'js-drop-in': [
        'POST /billing_requests — Create billing request with payment_request + mandate_request',
        'POST /billing_request_flows — Create flow; receive client_token for Drop-In',
        'Initialize GoCardless.js Drop-In with client_token — component mounts on your page',
        'Customer authorises instant payment + mandate via the embedded Drop-In component',
        'Handle onSuccess callback — receive mandate_id and payment_id',
        'POST /subscriptions — Create recurring subscription against the mandate',
        'Webhook: payments:confirmed (instant) + mandates:created + subscriptions:created',
      ],
      hosted: [
        'POST /billing_requests — Create billing request with payment_request (faster_payments) + mandate_request (bacs)',
        'POST /billing_request_flows — Create hosted flow; receive authorisation_url',
        'Redirect customer to GoCardless-hosted page',
        'Customer authorises instant payment + mandate in banking app',
        'GET /billing_requests/:id — Read payment_request_payment + mandate_request_mandate',
        'POST /subscriptions — Create recurring subscription against the mandate',
        'Webhook: payments:confirmed (instant) + mandates:created + subscriptions:created',
      ],
    },
  },
];
