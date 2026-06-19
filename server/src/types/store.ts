export interface StoredCustomer {
  id: string;
  name: string;
  email: string;
  created_at: string;
}

export interface StoredMandate {
  id: string;
  state: string;
  customer_id: string;
  scheme: string;
  created_at: string;
}

export interface StoredPayment {
  id: string;
  state: string;
  mandate_id: string;
  subscription_id?: string;
  instalment_schedule_id?: string;
  amount: number;
  currency: string;
  description: string;
  /** 'one-off-dd' | 'subscription-cycle' | 'instalment' | 'ibp' | 'instant-plus-dd' */
  type: string;
  created_at: string;
}

export interface StoredSubscription {
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

export interface StoredInstalmentSchedule {
  id: string;
  state: string;
  mandate_id: string;
  name: string;
  currency: string;
  total_amount: number;
  created_at: string;
}

// Shape returned by GET /history
export interface HistoryMandate extends StoredMandate {
  payments: StoredPayment[];
  subscriptions: StoredSubscription[];
  instalment_schedules: StoredInstalmentSchedule[];
}

export interface HistoryCustomer extends StoredCustomer {
  mandates: HistoryMandate[];
  ibp_payments: StoredPayment[];
}

export interface HistoryResponse {
  customers: HistoryCustomer[];
}
