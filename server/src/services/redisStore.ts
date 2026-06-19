import Redis from 'ioredis';
import { env } from '../config/env';
import type {
  StoredCustomer,
  StoredMandate,
  StoredPayment,
  StoredSubscription,
  StoredInstalmentSchedule,
} from '../types/store';

export const redis = new Redis(env.redisUrl, { lazyConnect: false });

redis.on('error', (err) => console.error('[Redis]', err));

// ── Key helpers ───────────────────────────────────────────────────────────────

const k = {
  customer: (id: string) => `customer:${id}`,
  mandate: (id: string) => `mandate:${id}`,
  payment: (id: string) => `payment:${id}`,
  subscription: (id: string) => `subscription:${id}`,
  instalmentSchedule: (id: string) => `instalment_schedule:${id}`,
  tempBr: (brId: string) => `temp:br:${brId}`,
  idx: {
    customers: 'idx:customers',
    mandates: 'idx:mandates',
    payments: 'idx:payments',
    subscriptions: 'idx:subscriptions',
    instalmentSchedules: 'idx:instalment_schedules',
  },
};

// ── Temp billing-request cache (name/email before mandate ID is known) ────────

export async function saveTempBrDetails(
  brId: string,
  data: { given_name: string; family_name: string; email: string }
): Promise<void> {
  await redis.hset(k.tempBr(brId), data);
  await redis.expire(k.tempBr(brId), 3600);
}

export async function getTempBrDetails(
  brId: string
): Promise<{ given_name: string; family_name: string; email: string } | null> {
  const raw = await redis.hgetall(k.tempBr(brId));
  if (!raw.email) return null;
  return raw as { given_name: string; family_name: string; email: string };
}

export async function deleteTempBrDetails(brId: string): Promise<void> {
  await redis.del(k.tempBr(brId));
}

// ── Customer ──────────────────────────────────────────────────────────────────

export async function upsertCustomer(customer: StoredCustomer): Promise<void> {
  await redis.hset(k.customer(customer.id), customer as unknown as Record<string, string>);
  await redis.sadd(k.idx.customers, customer.id);
}

export async function getCustomer(id: string): Promise<StoredCustomer | null> {
  const raw = await redis.hgetall(k.customer(id));
  if (!raw.id) return null;
  return raw as unknown as StoredCustomer;
}

export async function getAllCustomerIds(): Promise<string[]> {
  return redis.smembers(k.idx.customers);
}

// ── Mandate ───────────────────────────────────────────────────────────────────

export async function upsertMandate(mandate: StoredMandate): Promise<void> {
  await redis.hset(k.mandate(mandate.id), mandate as unknown as Record<string, string>);
  await redis.sadd(k.idx.mandates, mandate.id);
}

export async function updateMandateState(id: string, state: string): Promise<void> {
  await redis.hset(k.mandate(id), 'state', state);
}

export async function getMandate(id: string): Promise<StoredMandate | null> {
  const raw = await redis.hgetall(k.mandate(id));
  if (!raw.id) return null;
  return raw as unknown as StoredMandate;
}

export async function getMandatesByCustomer(customerId: string): Promise<StoredMandate[]> {
  const ids = await redis.smembers(k.idx.mandates);
  const mandates = await Promise.all(ids.map(getMandate));
  return mandates.filter((m): m is StoredMandate => m !== null && m.customer_id === customerId);
}

// ── Payment ───────────────────────────────────────────────────────────────────

export async function upsertPayment(payment: StoredPayment): Promise<void> {
  await redis.hset(k.payment(payment.id), payment as unknown as Record<string, string>);
  await redis.sadd(k.idx.payments, payment.id);
}

export async function updatePaymentState(id: string, state: string): Promise<void> {
  await redis.hset(k.payment(id), 'state', state);
}

export async function getPayment(id: string): Promise<StoredPayment | null> {
  const raw = await redis.hgetall(k.payment(id));
  if (!raw.id) return null;
  return { ...raw, amount: Number(raw.amount) } as StoredPayment;
}

export async function getPaymentsByMandate(mandateId: string): Promise<StoredPayment[]> {
  const ids = await redis.smembers(k.idx.payments);
  const payments = await Promise.all(ids.map(getPayment));
  return payments.filter((p): p is StoredPayment => p !== null && p.mandate_id === mandateId);
}

export async function getIbpPaymentsByCustomer(customerId: string): Promise<StoredPayment[]> {
  const ids = await redis.smembers(k.idx.payments);
  const payments = await Promise.all(ids.map(getPayment));
  return payments.filter(
    (p): p is StoredPayment =>
      p !== null &&
      (p.type === 'ibp' || p.type === 'instant-plus-dd') &&
      p.mandate_id === customerId
  );
}

// ── Subscription ──────────────────────────────────────────────────────────────

export async function upsertSubscription(sub: StoredSubscription): Promise<void> {
  await redis.hset(k.subscription(sub.id), sub as unknown as Record<string, string>);
  await redis.sadd(k.idx.subscriptions, sub.id);
}

export async function updateSubscriptionState(id: string, state: string): Promise<void> {
  await redis.hset(k.subscription(id), 'state', state);
}

export async function getSubscription(id: string): Promise<StoredSubscription | null> {
  const raw = await redis.hgetall(k.subscription(id));
  if (!raw.id) return null;
  return { ...raw, amount: Number(raw.amount), interval: Number(raw.interval) } as StoredSubscription;
}

export async function getSubscriptionsByMandate(mandateId: string): Promise<StoredSubscription[]> {
  const ids = await redis.smembers(k.idx.subscriptions);
  const subs = await Promise.all(ids.map(getSubscription));
  return subs.filter((s): s is StoredSubscription => s !== null && s.mandate_id === mandateId);
}

// ── Instalment Schedule ───────────────────────────────────────────────────────

export async function upsertInstalmentSchedule(is: StoredInstalmentSchedule): Promise<void> {
  await redis.hset(k.instalmentSchedule(is.id), is as unknown as Record<string, string>);
  await redis.sadd(k.idx.instalmentSchedules, is.id);
}

export async function updateInstalmentScheduleState(id: string, state: string): Promise<void> {
  await redis.hset(k.instalmentSchedule(id), 'state', state);
}

export async function getInstalmentSchedule(id: string): Promise<StoredInstalmentSchedule | null> {
  const raw = await redis.hgetall(k.instalmentSchedule(id));
  if (!raw.id) return null;
  return { ...raw, total_amount: Number(raw.total_amount) } as StoredInstalmentSchedule;
}

export async function getInstalmentSchedulesByMandate(
  mandateId: string
): Promise<StoredInstalmentSchedule[]> {
  const ids = await redis.smembers(k.idx.instalmentSchedules);
  const schedules = await Promise.all(ids.map(getInstalmentSchedule));
  return schedules.filter(
    (s): s is StoredInstalmentSchedule => s !== null && s.mandate_id === mandateId
  );
}
