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
  iban: string;
  country_code: string;
}

export interface CreateSubscriptionBody {
  mandate_id: string;
}

// ── Response shapes ───────────────────────────────────────────────────────────

export interface BillingRequest {
  id: string;
  created_at: string;
  status: string;
  links: {
    mandate_request_mandate?: string;
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
