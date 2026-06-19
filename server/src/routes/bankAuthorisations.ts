import { Router, Request, Response } from 'express';
import { gcFetch } from '../services/gocardless';
import { env } from '../config/env';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  try {
    const { billing_request_id } = req.body as { billing_request_id: string };
    const redirectUri = `${env.clientOrigin}/?gc_billing_request_id=${billing_request_id}`;

    const data = await gcFetch<{ bank_authorisations: { id: string; url: string } }>(
      '/bank_authorisations',
      {
        method: 'POST',
        body: {
          bank_authorisations: {
            redirect_uri: redirectUri,
            links: { billing_request: billing_request_id },
          },
        },
      }
    );
    res.status(201).json(data.bank_authorisations);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to create bank authorisation' });
  }
});

export default router;
