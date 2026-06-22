import { Router, Request, Response } from 'express';
import { gcClient } from '../services/gcClient';

const router = Router();

// POST /drop-in/start
// Creates a billing request and billing request flow.
// The Drop-In JS component handles all customer and bank detail collection itself.
router.post('/start', async (req: Request, res: Response) => {
  try {
    const { scheme = 'sepa_core', currency = 'EUR' } = req.body as { scheme?: string; currency?: string };
    // 1. Create billing request — pending actions (collect_customer_details,
    //    collect_bank_account, confirm_payer_details) are handled by the Drop-In
    const billingRequest = await gcClient.billingRequests.create({
      mandate_request: {
        scheme: scheme as 'sepa_core',
        currency: currency as 'EUR' },
    });


    // 2. Create billing request flow — auto_fulfil creates the mandate once
    //    the customer completes all steps inside the Drop-In
    const flow = await gcClient.billingRequestFlows.create({
      auto_fulfil: true,
      links: { billing_request: billingRequest.id },
    });


    res.status(201).json({
      billing_request_flow_id: flow.id,
      billing_request_id: billingRequest.id,
    });
  } catch (err) {
    console.error('[drop-in/start]', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to start drop-in' });
  }
});

export default router;
