import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { env } from '../config/env';

export function validateWebhookSignature(req: Request, res: Response, next: NextFunction): void {
  const signature = req.headers['webhook-signature'];

  if (!signature || typeof signature !== 'string') {
    res.status(401).json({ error: 'Missing Webhook-Signature header' });
    return;
  }

  const rawBody = req.body as Buffer;

  const expected = crypto
    .createHmac('sha256', env.gcWebhookSecret)
    .update(rawBody)
    .digest('hex');

  // timingSafeEqual requires equal-length buffers; both are 64-char hex strings
  const sigBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');

  if (
    sigBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
  ) {
    res.status(401).json({ error: 'Invalid webhook signature' });
    return;
  }

  next();
}
