import { Router, Request, Response } from 'express';
import { gcFetch } from '../services/gocardless';
import { upsertInstalmentSchedule } from '../services/redisStore';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  try {
    const { mandate_id, name, currency, total_amount, instalments } = req.body as {
      mandate_id: string;
      name: string;
      currency: string;
      total_amount: number;
      instalments: unknown;
    };

    const data = await gcFetch<{ instalment_schedules: { id: string; [key: string]: unknown } }>('/instalment_schedules', {
      method: 'POST',
      body: {
        instalment_schedules: {
          name,
          currency,
          total_amount,
          instalments,
          links: { mandate: mandate_id },
        },
      },
    });

    const schedule = data.instalment_schedules;
    await upsertInstalmentSchedule({
      id: schedule.id,
      state: 'created',
      mandate_id,
      name,
      currency,
      total_amount,
      created_at: new Date().toISOString(),
    });

    res.status(201).json(schedule);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to create instalment schedule' });
  }
});

export default router;
