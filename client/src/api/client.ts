import type {
  CollectCustomerDetailsBody,
  CollectBankAccountBody,
  CreateSubscriptionBody,
  BillingRequest,
  Subscription,
} from '../types/api';

const BASE = 'http://localhost:3001';

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

export const api = {
  createBillingRequest: () =>
    post<BillingRequest>('/billing-requests'),

  collectCustomerDetails: (id: string, body: CollectCustomerDetailsBody) =>
    post<BillingRequest>(`/billing-requests/${id}/collect-customer-details`, body),

  collectBankAccount: (id: string, body: CollectBankAccountBody) =>
    post<BillingRequest>(`/billing-requests/${id}/collect-bank-account`, body),

  confirmPayerDetails: (id: string) =>
    post<BillingRequest>(`/billing-requests/${id}/confirm-payer-details`),

  fulfilBillingRequest: (id: string) =>
    post<BillingRequest>(`/billing-requests/${id}/fulfil`),

  createSubscription: (body: CreateSubscriptionBody) =>
    post<Subscription>('/subscriptions', body),
};
