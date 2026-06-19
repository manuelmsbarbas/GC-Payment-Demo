import { Router, Request, Response } from 'express';
import { gcFetch } from '../services/gocardless';
import { upsertPayment } from '../services/redisStore';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  try {
    const { mandate_id, amount, currency, description } = req.body as {
      mandate_id: string;
      amount: number;
      currency: string;
      description?: string;
    };

    const data = await gcFetch<{ payments: { id: string; [key: string]: unknown } }>('/payments', {
      method: 'POST',
      body: {
        payments: {
          amount,
          currency,
          description: description ?? 'One-off Direct Debit payment',
          links: { mandate: mandate_id },
        },
      },
    });

    const payment = data.payments;
    await upsertPayment({
      id: payment.id,
      state: 'created',
      mandate_id,
      amount,
      currency,
      description: description ?? 'One-off Direct Debit payment',
      type: 'one-off-dd',
      created_at: new Date().toISOString(),
    });

    res.status(201).json(payment);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to create payment' });
  }
});

export default router;
