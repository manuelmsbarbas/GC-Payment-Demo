import { Router, Request, Response } from 'express';
import { gcFetch } from '../services/gocardless';
import { env } from '../config/env';

const router = Router();

// POST /hosted/start
// Creates a SEPA billing request and a billing request flow for the GoCardless Hosted
// Payment Pages integration. auto_fulfil is false — we fulfil manually on callback so
// the mandate ID is available to create the subscription/payment/instalment schedule.
router.post('/start', async (_req: Request, res: Response) => {
  try {
    const brData = await gcFetch<{ billing_requests: { id: string } }>('/billing_requests', {
      method: 'POST',
      body: {
        billing_requests: {
          mandate_request: { scheme: 'sepa_core', currency: 'EUR' },
        },
      },
    });
    const billingRequestId = brData.billing_requests.id;

    const redirectUri = `${env.clientOrigin}/?gc_billing_request_id=${billingRequestId}`;

    const bfrData = await gcFetch<{
      billing_request_flows: { id: string; authorisation_url: string };
    }>('/billing_request_flows', {
      method: 'POST',
      body: {
        billing_request_flows: {
          redirect_uri: redirectUri,
          exit_uri: env.clientOrigin,
          links: { billing_request: billingRequestId },
        },
      },
    });

    res.status(201).json({
      authorisation_url: bfrData.billing_request_flows.authorisation_url,
      billing_request_id: billingRequestId,
    });
  } catch (err) {
    console.error('[hosted/start]', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to start hosted flow',
    });
  }
});

// POST /hosted/ibp/start
// Creates a billing request with a payment_request (FasterPayments / IBP) and a hosted flow.
router.post('/ibp/start', async (req: Request, res: Response) => {
  try {
    const { amount, currency = 'GBP' } = req.body as { amount?: number; currency?: string };

    const brData = await gcFetch<{ billing_requests: { id: string } }>('/billing_requests', {
      method: 'POST',
      body: {
        billing_requests: {
          payment_request: {
            description: 'Instant Bank Pay',
            amount: amount ?? 1000,
            currency,
            scheme: 'faster_payments',
          },
        },
      },
    });
    const billingRequestId = brData.billing_requests.id;

    const redirectUri = `${env.clientOrigin}/?gc_billing_request_id=${billingRequestId}`;

    const bfrData = await gcFetch<{
      billing_request_flows: { id: string; authorisation_url: string };
    }>('/billing_request_flows', {
      method: 'POST',
      body: {
        billing_request_flows: {
          redirect_uri: redirectUri,
          exit_uri: env.clientOrigin,
          links: { billing_request: billingRequestId },
        },
      },
    });

    res.status(201).json({
      authorisation_url: bfrData.billing_request_flows.authorisation_url,
      billing_request_id: billingRequestId,
    });
  } catch (err) {
    console.error('[hosted/ibp/start]', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to start hosted IBP flow',
    });
  }
});

// POST /hosted/instant-plus-dd/start
// Creates a billing request with BOTH payment_request (FasterPayments) AND mandate_request (Bacs)
// for the Instant + Direct Debit hosted flow.
router.post('/instant-plus-dd/start', async (req: Request, res: Response) => {
  try {
    const { amount, currency = 'GBP' } = req.body as { amount?: number; currency?: string };

    const brData = await gcFetch<{ billing_requests: { id: string } }>('/billing_requests', {
      method: 'POST',
      body: {
        billing_requests: {
          payment_request: {
            description: 'Instant Bank Pay',
            amount: amount ?? 1000,
            currency,
            scheme: 'faster_payments',
          },
          mandate_request: {
            scheme: 'bacs',
            currency: 'GBP',
          },
        },
      },
    });
    const billingRequestId = brData.billing_requests.id;

    const redirectUri = `${env.clientOrigin}/?gc_billing_request_id=${billingRequestId}`;

    const bfrData = await gcFetch<{
      billing_request_flows: { id: string; authorisation_url: string };
    }>('/billing_request_flows', {
      method: 'POST',
      body: {
        billing_request_flows: {
          redirect_uri: redirectUri,
          exit_uri: env.clientOrigin,
          links: { billing_request: billingRequestId },
        },
      },
    });

    res.status(201).json({
      authorisation_url: bfrData.billing_request_flows.authorisation_url,
      billing_request_id: billingRequestId,
    });
  } catch (err) {
    console.error('[hosted/instant-plus-dd/start]', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to start hosted Instant + DD flow',
    });
  }
});

export default router;
