import { Router, Request, Response } from 'express';
import { webhookEmitter } from '../events/emitter';
import { WebhookEvent } from '../types/webhook';

const router = Router();

/**
 * GET /api/events/stream
 * Server-Sent Events stream. Clients subscribe here to receive
 * real-time webhook events as they are processed by the worker.
 */
router.get('/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send a heartbeat every 30s to prevent proxy timeouts
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 30_000);

  const onWebhook = (event: WebhookEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  webhookEmitter.on('webhook', onWebhook);

  req.on('close', () => {
    clearInterval(heartbeat);
    webhookEmitter.off('webhook', onWebhook);
  });
});

export default router;
