// ── Pre-fill ──────────────────────────────────────────────────────────────────

export interface PrefilledCustomer {
  given_name?: string;
  family_name?: string;
  email?: string;
  address_line1?: string;
  city?: string;
  postal_code?: string;
  country_code?: string;
}

// ── Request bodies ────────────────────────────────────────────────────────────

export interface CollectCustomerDetailsBody {
  given_name: string;
  family_name: string;
  email: string;
  address_line1: string;
  city: string;
  postal_code: string;
  country_code: string;
}

export interface CollectBankAccountBody {
  account_holder_name: string;
  country_code: string;
  // IBAN (SEPA and GB/AU when available)
  iban?: string;
  // UK Bacs local fields
  sort_code?: string;
  // AU BECS local fields
  bsb?: string;
  // Shared local field for UK/AU
  account_number?: string;
}

export interface CreateSubscriptionBody {
  mandate_id: string;
  amount?: number;
  currency?: string;
  name?: string;
  interval?: number;
  interval_unit?: 'weekly' | 'monthly' | 'yearly';
}

export type CreateBillingRequestBody =
  | { payment_type: 'payment'; amount: number; currency: string }
  | {
      payment_type: 'instant-plus-dd';
      amount: number;
      currency: string;
      sub_name: string;
      sub_amount: string;
      sub_interval: string;
      sub_interval_unit: string;
      sub_currency: string;
    }
  | { scheme: string; currency: string };

export interface CreatePaymentBody {
  mandate_id: string;
  amount: number;
  currency: string;
  description?: string;
}

export interface InstalmentWithDate {
  amount: number;
  charge_date: string;
  description?: string;
}

export interface InstalmentWithSchedule {
  start_date?: string;
  interval: number;
  interval_unit: 'weekly' | 'monthly' | 'yearly';
  amounts: number[];
}

export interface CreateInstalmentScheduleBody {
  mandate_id: string;
  name: string;
  currency: string;
  total_amount: number;
  instalments: InstalmentWithDate[] | InstalmentWithSchedule;
}

// ── Response shapes ───────────────────────────────────────────────────────────

export interface BillingRequest {
  id: string;
  created_at: string;
  status: string;
  links: {
    mandate_request_mandate?: string;
    payment_request_payment?: string;
  };
}

export interface Subscription {
  id: string;
  created_at: string;
  status: string;
  amount: number;
  currency: string;
  interval_unit: string;
  name: string;
}

export interface Payment {
  id: string;
  created_at: string;
  status: string;
  amount: number;
  currency: string;
  description?: string;
}

export interface InstalmentSchedule {
  id: string;
  status: string;
  total_amount: string;
  currency: string;
  name: string;
}

export interface Institution {
  id: string;
  name: string;
  icon_url?: string;
  bic?: string;
}

export interface BankAuthorisation {
  id: string;
  url: string;
}

// ── Flow state ────────────────────────────────────────────────────────────────

export type StepStatus = 'idle' | 'loading' | 'success' | 'error';

export interface FlowStep<T> {
  status: StepStatus;
  data?: T;
  error?: string;
}

export interface SubscriptionFlow {
  createBillingRequest: FlowStep<BillingRequest>;
  collectCustomerDetails: FlowStep<BillingRequest>;
  collectBankAccount: FlowStep<BillingRequest>;
  confirmPayerDetails: FlowStep<BillingRequest>;
  fulfilBillingRequest: FlowStep<BillingRequest>;
  createSubscription: FlowStep<Subscription>;
}

export interface OneOffDDFlow {
  createBillingRequest: FlowStep<BillingRequest>;
  collectCustomerDetails: FlowStep<BillingRequest>;
  collectBankAccount: FlowStep<BillingRequest>;
  confirmPayerDetails: FlowStep<BillingRequest>;
  fulfilBillingRequest: FlowStep<BillingRequest>;
  createPayment: FlowStep<Payment>;
}

export interface InstalmentFlow {
  createBillingRequest: FlowStep<BillingRequest>;
  collectCustomerDetails: FlowStep<BillingRequest>;
  collectBankAccount: FlowStep<BillingRequest>;
  confirmPayerDetails: FlowStep<BillingRequest>;
  fulfilBillingRequest: FlowStep<BillingRequest>;
  createInstalmentSchedule: FlowStep<InstalmentSchedule>;
}

export interface IBPFlow {
  selectInstitution: FlowStep<BillingRequest>;
  createBankAuthorisation: FlowStep<BankAuthorisation>;
}

export interface InstantPlusDDFlow {
  createBillingRequest: FlowStep<BillingRequest>;
  collectCustomerDetails: FlowStep<BillingRequest>;
  selectInstitution: FlowStep<BillingRequest>;
  createBankAuthorisation: FlowStep<BankAuthorisation>;
  createSubscription: FlowStep<Subscription>;
}

export interface DropInStartResponse {
  billing_request_flow_id: string;
  billing_request_id: string;
}

export interface HostedStartResponse {
  authorisation_url: string;
  billing_request_id: string;
}

export interface HostedSessionConfig {
  methodId: string;
  billingRequestId: string;
  currency: string;
  // Custom flow identifiers
  flow?: 'ibp-custom' | 'instant-plus-dd-custom';
  // Subscription
  subName?: string;
  subAmount?: string;
  subInterval?: string;
  subIntervalUnit?: 'weekly' | 'monthly' | 'yearly';
  // One-off DD
  amountInput?: string;
  // Instalments
  instalmentMode?: 'dates' | 'schedule';
  instalmentName?: string;
  instalmentDates?: Array<{ amount: string; charge_date: string }>;
  instalmentScheduleParams?: {
    start_date: string;
    interval: string;
    interval_unit: 'weekly' | 'monthly' | 'yearly';
  };
  instalmentAmounts?: string[];
}

// ── Payment History ───────────────────────────────────────────────────────────

export interface HistoryPayment {
  id: string;
  state: string;
  mandate_id: string;
  subscription_id?: string;
  instalment_schedule_id?: string;
  amount: number;
  currency: string;
  description: string;
  type: string;
  created_at: string;
}

export interface HistorySubscription {
  id: string;
  state: string;
  mandate_id: string;
  name: string;
  amount: number;
  currency: string;
  interval: number;
  interval_unit: string;
  created_at: string;
}

export interface HistoryInstalmentSchedule {
  id: string;
  state: string;
  mandate_id: string;
  name: string;
  currency: string;
  total_amount: number;
  created_at: string;
}

export interface HistoryMandate {
  id: string;
  state: string;
  customer_id: string;
  scheme: string;
  created_at: string;
  payments: HistoryPayment[];
  subscriptions: HistorySubscription[];
  instalment_schedules: HistoryInstalmentSchedule[];
}

export interface HistoryCustomer {
  id: string;
  name: string;
  email: string;
  created_at: string;
  mandates: HistoryMandate[];
  ibp_payments: HistoryPayment[];
}

export interface HistoryResponse {
  customers: HistoryCustomer[];
}

// ── Webhook events ─────────────────────────────────────────────────────────────

export interface WebhookEventDetails {
  origin: string;
  cause: string;
  description: string;
}

export interface WebhookEvent {
  id: string;
  created_at: string;
  action: string;
  resource_type: string;
  links: Record<string, string>;
  details: WebhookEventDetails;
}
