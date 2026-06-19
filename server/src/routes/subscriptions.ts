import { Router, Request, Response } from 'express';
import { gcFetch } from '../services/gocardless';
import { upsertSubscription } from '../services/redisStore';

const router = Router();

/**
 * POST /api/subscriptions
 * Creates a monthly 10 EUR SEPA subscription against a mandate from a fulfilled billing request.
 *
 * Body: { mandate_id }
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      mandate_id,
      amount = 1000,
      currency = 'EUR',
      name = 'Europa SEPA Subscription',
      interval_unit = 'monthly',
      interval = 1,
    } = req.body as {
      mandate_id: string;
      amount?: number;
      currency?: string;
      name?: string;
      interval_unit?: string;
      interval?: number;
    };

    const data = await gcFetch<{ subscriptions: { id: string; [key: string]: unknown } }>('/subscriptions', {
      method: 'POST',
      body: {
        subscriptions: {
          amount,
          currency,
          name,
          interval_unit,
          interval,
          links: { mandate: mandate_id },
        },
      },
    });

    const sub = data.subscriptions;
    await upsertSubscription({
      id: sub.id,
      state: 'created',
      mandate_id,
      name,
      amount,
      currency,
      interval,
      interval_unit,
      created_at: new Date().toISOString(),
    });

    res.status(201).json(sub);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to create subscription' });
  }
});

export default router;
