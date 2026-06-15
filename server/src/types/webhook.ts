export interface WebhookEventDetails {
  origin: string;
  cause: string;
  description: string;
  scheme?: string;
  reason_code?: string;
}

export interface WebhookEvent {
  id: string;
  created_at: string;
  action: string;
  resource_type: 'payments' | 'mandates' | 'subscriptions' | 'refunds' | 'payouts' | string;
  links: Record<string, string>;
  details: WebhookEventDetails;
  metadata: Record<string, string>;
}

export interface WebhookPayload {
  events: WebhookEvent[];
}

export interface WebhookJobData {
  event: WebhookEvent;
}
