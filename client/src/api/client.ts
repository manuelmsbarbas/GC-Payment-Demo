import type {
  CollectCustomerDetailsBody,
  CollectBankAccountBody,
  CreateSubscriptionBody,
  CreateBillingRequestBody,
  CreatePaymentBody,
  CreateInstalmentScheduleBody,
  DropInStartResponse,
  HostedStartResponse,
  BillingRequest,
  Subscription,
  Payment,
  InstalmentSchedule,
  Institution,
  BankAuthorisation,
  HistoryResponse,
} from '../types/api';

const BASE = 'https://gc-demo-test-server-production.up.railway.app';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  const data = (await res.json()) as T;
  if (!res.ok) {
    const msg = (data as { error?: string }).error ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
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

export const api = {
  createBillingRequest: (body?: CreateBillingRequestBody) =>
    post<BillingRequest>('/billing-requests', body),

  collectCustomerDetails: (id: string, body: CollectCustomerDetailsBody) =>
    post<BillingRequest>(`/billing-requests/${id}/collect-customer-details`, body),

  collectBankAccount: (id: string, body: CollectBankAccountBody) =>
    post<BillingRequest>(`/billing-requests/${id}/collect-bank-account`, body),

  confirmPayerDetails: (id: string) =>
    post<BillingRequest>(`/billing-requests/${id}/confirm-payer-details`),

  getBillingRequest: (id: string) =>
    get<BillingRequest>(`/billing-requests/${id}`),

  fulfilBillingRequest: (id: string) =>
    post<BillingRequest>(`/billing-requests/${id}/fulfil`),

  createSubscription: (body: CreateSubscriptionBody) =>
    post<Subscription>('/subscriptions', body),

  createPayment: (body: CreatePaymentBody) =>
    post<Payment>('/payments', body),

  createInstalmentSchedule: (body: CreateInstalmentScheduleBody) =>
    post<InstalmentSchedule>('/instalment-schedules', body),

  dropInStart: (scheme: string, currency: string) =>
    post<DropInStartResponse>('/drop-in/start', { scheme, currency }),

  hostedStart: (scheme: string, currency: string) =>
    post<HostedStartResponse>('/hosted/start', { scheme, currency }),

  getInstitutions: (id: string, countryCode = 'GB') =>
    get<Institution[]>(`/billing-requests/${id}/institutions?country_code=${countryCode}`),

  selectInstitution: (id: string, institution: string, country_code: string) =>
    post<BillingRequest>(`/billing-requests/${id}/select-institution`, { institution, country_code }),

  createBankAuthorisation: (billing_request_id: string) =>
    post<BankAuthorisation>('/bank-authorisations', { billing_request_id }),

  hostedIbpStart: (amount: number, currency: string) =>
    post<HostedStartResponse>('/hosted/ibp/start', { amount, currency }),

  hostedInstantPlusDDStart: (amount: number, currency: string) =>
    post<HostedStartResponse>('/hosted/instant-plus-dd/start', { amount, currency }),

  getHistory: () =>
    get<HistoryResponse>('/history'),
};
