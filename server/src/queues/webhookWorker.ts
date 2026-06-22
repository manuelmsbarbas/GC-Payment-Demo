import { WebhookEvent } from '../types/webhook';
import { webhookEmitter } from '../events/emitter';
import {
  upsertCustomer,
  upsertMandate,
  updateMandateState,
  upsertPayment,
  updatePaymentState,
  updateSubscriptionState,
  updateInstalmentScheduleState,
  getMandate,
  getCustomer,
  getPayment,
  getTempBrDetails,
  deleteTempBrDetails,
} from '../services/redisStore';

async function handleMandate(event: WebhookEvent): Promise<void> {
  const id = event.links.mandate;
  const customerId = event.links.customer;

  if (event.action === 'created' && id && customerId) {
    // Ensure customer record exists (may arrive before billing-request callback for hosted/IBP flows)
    const existing = await getMandate(id);
    if (!existing) {
      await upsertCustomer({
        id: customerId,
        name: 'Unknown',
        email: '',
        created_at: event.created_at,
      });
      await upsertMandate({
        id,
        state: 'created',
        customer_id: customerId,
        scheme: event.details?.scheme ?? 'unknown',
        created_at: event.created_at,
      });
    }
    return;
  }

  const stateMap: Record<string, string> = {
    submitted: 'submitted',
    active: 'active',
    failed: 'failed',
    cancelled: 'cancelled',
    expired: 'expired',
    reinstated: 'active',
  };
  if (id && stateMap[event.action]) {
    await updateMandateState(id, stateMap[event.action]);
  }
}

async function handlePayment(event: WebhookEvent): Promise<void> {
  const id = event.links.payment;
  const mandateId = event.links.mandate;
  const subscriptionId = event.links.subscription;
  const instalmentScheduleId = event.links.instalment_schedule;

  if (event.action === 'created' && id && mandateId) {
    // Payments created by subscription cycles or instalment schedules arrive here
    const type = subscriptionId
      ? 'subscription-cycle'
      : instalmentScheduleId
      ? 'instalment'
      : 'one-off-dd';
    await upsertPayment({
      id,
      state: 'created',
      mandate_id: mandateId,
      subscription_id: subscriptionId,
      instalment_schedule_id: instalmentScheduleId,
      amount: 0,
      currency: '',
      description: '',
      type,
      created_at: event.created_at,
    });
    return;
  }

  const stateMap: Record<string, string> = {
    submitted: 'submitted',
    confirmed: 'confirmed',
    paid_out: 'paid_out',
    failed: 'failed',
    cancelled: 'cancelled',
    charged_back: 'charged_back',
    late_failure_settled: 'failed',
    chargeback_settled: 'charged_back',
  };
  if (id && stateMap[event.action]) {
    await updatePaymentState(id, stateMap[event.action]);
  }
}

async function handleSubscription(event: WebhookEvent): Promise<void> {
  const id = event.links.subscription;
  if (!id) return;

  const stateMap: Record<string, string> = {
    created: 'created',
    active: 'active',
    paused: 'paused',
    resumed: 'active',
    cancelled: 'cancelled',
    finished: 'finished',
  };
  if (stateMap[event.action]) {
    await updateSubscriptionState(id, stateMap[event.action]);
  }
}

async function handleInstalmentSchedule(event: WebhookEvent): Promise<void> {
  const id = event.links.instalment_schedule;
  if (!id) return;

  const stateMap: Record<string, string> = {
    created: 'created',
    errored: 'errored',
    completed: 'completed',
    cancelled: 'cancelled',
    resumed: 'active',
  };
  if (stateMap[event.action]) {
    await updateInstalmentScheduleState(id, stateMap[event.action]);
  }
}

async function handleBillingRequest(event: WebhookEvent): Promise<void> {
  if (event.action !== 'fulfilled') return;

  const brId = event.links.billing_request;
  const paymentId = event.links.payment_request_payment;
  const mandateId = event.links.mandate_request_mandate;
  const customerId = event.links.customer;

  if (!brId || !customerId) return;

  // Seed customer — skip if the redirect callback already created it
  const existingCustomer = await getCustomer(customerId);
  if (!existingCustomer) {
    const temp = await getTempBrDetails(brId);
    await upsertCustomer({
      id: customerId,
      name: temp ? `${temp.given_name} ${temp.family_name}` : 'Unknown',
      email: temp?.email ?? '',
      created_at: event.created_at,
    });
    if (temp) await deleteTempBrDetails(brId);
  }

  // Seed IBP payment — skip if the redirect callback already created it
  if (paymentId) {
    const existingPayment = await getPayment(paymentId);
    if (!existingPayment) {
      const isInstantPlusDD = !!mandateId;
      await upsertPayment({
        id: paymentId,
        state: 'created',
        mandate_id: mandateId ?? customerId,
        amount: 0,
        currency: '',
        description: 'Instant Bank Pay',
        type: isInstantPlusDD ? 'instant-plus-dd' : 'ibp',
        created_at: event.created_at,
      });
    }
  }

  // Seed Bacs mandate for Instant+DD — skip if already created by mandate webhook
  if (mandateId) {
    const existingMandate = await getMandate(mandateId);
    if (!existingMandate) {
      await upsertMandate({
        id: mandateId,
        state: 'created',
        customer_id: customerId,
        scheme: 'bacs',
        created_at: event.created_at,
      });
    }
  }
}

export function processWebhookEvent(event: WebhookEvent): void {
  console.log(`[Worker] ${event.resource_type}.${event.action} — ${event.id}`);

  const handle = async () => {
    switch (event.resource_type) {
      case 'mandates':
        await handleMandate(event);
        break;
      case 'payments':
        await handlePayment(event);
        break;
      case 'billing_requests':
        await handleBillingRequest(event);
        break;
      case 'subscriptions':
        await handleSubscription(event);
        break;
      case 'instalment_schedules':
        await handleInstalmentSchedule(event);
        break;
      default:
        console.log(`[Worker] Unhandled resource_type: ${event.resource_type}`);
    }
    webhookEmitter.broadcast(event);
  };

  handle().catch((err) => console.error('[Worker] Error processing event:', err));
}
