import { EventEmitter } from 'events';
import { WebhookEvent } from '../types/webhook';

class WebhookEmitter extends EventEmitter {
  broadcast(event: WebhookEvent): void {
    this.emit('webhook', event);
  }
}

export const webhookEmitter = new WebhookEmitter();
