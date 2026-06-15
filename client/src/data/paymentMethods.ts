import type { FlowType, SchemeId } from '../types/filters';

export type PaymentMethodId =
  | 'one-off-dd'
  | 'subscription'
  | 'instalment'
  | 'instant-bank-pay'
  | 'instant-plus-dd'
  | 'vrp';

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
}

const SEPA_INSTANT_COUNTRIES = ['AT','BE','EE','FI','FR','DE','IE','IT','LV','LT','LU','NL','PT','SI'];

function ibpAvailability(scheme: SchemeId, countryCode: string): AvailabilityResult {
  if (scheme === 'Bacs' && countryCode === 'GB') return { available: true };
  if (scheme === 'SEPA' && SEPA_INSTANT_COUNTRIES.includes(countryCode)) return { available: true };
  const reason = scheme === 'SEPA'
    ? `SEPA Instant not supported in this country — Instant Bank Pay requires Faster Payments (GBP) or SEPA Instant`
    : `Instant Bank Pay requires Faster Payments (GBP) or SEPA Instant — not available for ${scheme}`;
  return { available: false, reason };
}

export const PAYMENT_METHODS: PaymentMethodDef[] = [
  {
    id: 'one-off-dd',
    name: 'One-off Direct Debit',
    tagline: 'Ad-hoc variable-amount collection',
    description: 'Collect payments on an ad-hoc basis with varying amounts, frequency, and/or timing as agreed with the customer.',
    bestFor: ['Usage billing', 'Invoices', 'Variable charges'],
    flows: ['hosted', 'custom'],
    schemesLabel: 'All schemes',
    docsPath: 'https://developer.gocardless.com/one-off-payments/one-off-direct-debit/',
    checkAvailability: () => ({ available: true }),
  },
  {
    id: 'subscription',
    name: 'Subscriptions',
    tagline: 'Fixed recurring billing',
    description: 'Fixed amount collected automatically at regular intervals.',
    bestFor: ['SaaS', 'Memberships', 'Recurring billing'],
    flows: ['hosted', 'custom'],
    schemesLabel: 'All schemes',
    docsPath: 'https://developer.gocardless.com/recurring-payments/subscriptions/',
    checkAvailability: () => ({ available: true }),
  },
  {
    id: 'instalment',
    name: 'Instalments',
    tagline: 'Fixed payment plan over time',
    description: 'Fixed number of payments spreading the cost of a purchase.',
    bestFor: ['Payment plans', 'Tuition', 'High-ticket items'],
    flows: ['hosted', 'custom'],
    schemesLabel: 'All schemes',
    docsPath: 'https://developer.gocardless.com/recurring-payments/instalments/',
    checkAvailability: () => ({ available: true }),
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
  },
  {
    id: 'vrp',
    name: 'Variable Recurring Payments',
    tagline: 'Open banking consent — GBP only',
    description: 'Recurring variable payments via open banking consent; authorised once, enabling future recurring and instant payments.',
    bestFor: ['Sweeping', 'Loan repayments', 'Investment top-ups'],
    flows: ['hosted'],
    schemesLabel: 'GBP only',
    docsPath: 'https://developer.gocardless.com/recurring-payments/variable-recurring-payments/',
    checkAvailability: (scheme) => scheme === 'Bacs'
      ? { available: true }
      : { available: false, reason: 'Variable Recurring Payments (Pay By Bank) is available in GBP (UK) only' },
  },
];
