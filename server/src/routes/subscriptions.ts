import { Router, Request, Response } from 'express';
import { gcFetch } from '../services/gocardless';

const router = Router();

/**
 * POST /api/subscriptions
 * Creates a monthly 10 EUR SEPA subscription against a mandate from a fulfilled billing request.
 *
 * Body: { mandate_id }
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { mandate_id } = req.body as { mandate_id: string };

    const data = await gcFetch<{ subscriptions: unknown }>('/subscriptions', {
      method: 'POST',
      body: {
        subscriptions: {
          amount: 1000,
          currency: 'EUR',
          name: 'Europa SEPA Subscription',
          interval_unit: 'monthly',
          interval: 1,
          links: { mandate: mandate_id },
        },
      },
    });

    res.status(201).json(data.subscriptions);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to create subscription' });
  }
});

export default router;
