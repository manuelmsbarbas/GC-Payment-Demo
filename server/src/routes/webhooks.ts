import { Router, Request, Response } from 'express';
import { validateWebhookSignature } from '../middleware/webhookSignature';
import { processWebhookEvent } from '../queues/webhookWorker';
import { WebhookPayload } from '../types/webhook';

const router = Router();

/**
 * POST /api/webhooks
 * Receives GoCardless webhook events, validates the signature,
 * and processes each event synchronously before returning 200.
 *
 * Note: express.raw() is applied to this path in index.ts so that
 * req.body is a raw Buffer for signature verification.
 */
router.post('/', validateWebhookSignature, (req: Request, res: Response) => {
  try {
    const payload = JSON.parse((req.body as Buffer).toString()) as WebhookPayload;

    for (const event of payload.events) {
      processWebhookEvent(event);
    }

    console.log(`[Webhook] Processed ${payload.events.length} event(s)`);
    res.status(200).json({ received: payload.events.length });
  } catch (err) {
    console.error('[Webhook] Failed to process payload:', err);
    res.status(400).json({ error: 'Invalid payload' });
  }
});

export default router;
