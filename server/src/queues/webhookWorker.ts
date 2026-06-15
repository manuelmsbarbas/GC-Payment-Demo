import { WebhookEvent } from '../types/webhook';
import { webhookEmitter } from '../events/emitter';

function handleMandate(event: WebhookEvent): void {
  const id = event.links.mandate;
  switch (event.action) {
    case 'created':
    case 'submitted':
    case 'active':
      console.log(`[Mandate] ${event.action}: ${id}`);
      break;
    case 'failed':
    case 'expired':
    case 'cancelled':
      console.log(`[Mandate] ${event.action}: ${id} — ${event.details?.cause}`);
      break;
  }
}

function handlePayment(event: WebhookEvent): void {
  const id = event.links.payment;
  switch (event.action) {
    case 'created':
    case 'submitted':
    case 'confirmed':
    case 'paid_out':
      console.log(`[Payment] ${event.action}: ${id}`);
      break;
    case 'failed':
    case 'cancelled':
    case 'charged_back':
      console.log(`[Payment] ${event.action}: ${id} — ${event.details?.cause}`);
      break;
  }
}

function handleSubscription(event: WebhookEvent): void {
  console.log(`[Subscription] ${event.action}: ${event.links.subscription}`);
}

export function processWebhookEvent(event: WebhookEvent): void {
  console.log(`[Worker] ${event.resource_type}.${event.action} — ${event.id}`);

  switch (event.resource_type) {
    case 'mandates':
      handleMandate(event);
      break;
    case 'payments':
      handlePayment(event);
      break;
    case 'subscriptions':
      handleSubscription(event);
      break;
    default:
      console.log(`[Worker] Unhandled resource_type: ${event.resource_type}`);
  }

  webhookEmitter.broadcast(event);
}
