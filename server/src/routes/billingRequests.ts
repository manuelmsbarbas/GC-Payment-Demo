import { Router, Request, Response } from 'express';
import { gcFetch } from '../services/gocardless';
import {
  redis,
  saveTempBrDetails,
  saveTempBrSubConfig,
  getTempBrDetails,
  deleteTempBrDetails,
  upsertCustomer,
  upsertMandate,
  getMandate,
  upsertPayment,
  getPayment,
} from '../services/redisStore';

const router = Router();

interface BillingRequestResponse {
  billing_requests: {
    id: string;
    status: string;
    links: { mandate_request_mandate?: string; payment_request_payment?: string };
    resources?: {
      customer?: {
        given_name?: string;
        family_name?: string;
        email?: string;
      };
    };
    [key: string]: unknown;
  };
}

// GET /:id — Read billing request (used by all callbacks after GoCardless auto-fulfils)
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = await gcFetch<BillingRequestResponse>(`/billing_requests/${id}`, {
      method: 'GET',
    });

    const br = data.billing_requests;
    const links = br.links as Record<string, string>;
    const customerId = links.customer;
    const mandateId = links.mandate_request_mandate;
    const paymentId = links.payment_request_payment;

    if (customerId) {
      const temp = await getTempBrDetails(id);
      const gcCustomer = br.resources?.customer;
      await upsertCustomer({
        id: customerId,
        name: gcCustomer
          ? `${gcCustomer.given_name ?? ''} ${gcCustomer.family_name ?? ''}`.trim() || 'Unknown'
          : temp
            ? `${temp.given_name} ${temp.family_name}`
            : 'Unknown',
        email: gcCustomer?.email ?? temp?.email ?? '',
        created_at: new Date().toISOString(),
      });

      if (mandateId) {
        const existingMandate = await getMandate(mandateId);
        if (!existingMandate) {
          const brFull = br as unknown as Record<string, unknown>;
          const mandateReq = brFull.mandate_request as Record<string, string> | undefined;
          // Preserve state set by concurrent mandate webhook events (e.g. mandates.active)
          const existingState = await redis.hget(`mandate:${mandateId}`, 'state');
          await upsertMandate({
            id: mandateId,
            state: existingState ?? 'created',
            customer_id: customerId,
            scheme: mandateReq?.scheme ?? 'unknown',
            created_at: new Date().toISOString(),
          });
        }
      }

      if (paymentId) {
        const existingPayment = await getPayment(paymentId);
        if (!existingPayment) {
          const brFull = br as unknown as Record<string, unknown>;
          const paymentReq = brFull.payment_request as Record<string, unknown> | undefined;
          const isInstantPlusDD = !!mandateId;
          // Preserve state set by concurrent payment webhook events (e.g. payments.confirmed)
          const existingState = await redis.hget(`payment:${paymentId}`, 'state');
          await upsertPayment({
            id: paymentId,
            state: existingState ?? 'created',
            mandate_id: mandateId ?? customerId,
            amount: Number(paymentReq?.amount ?? 0),
            currency: String(paymentReq?.currency ?? 'GBP'),
            description: String(paymentReq?.description ?? 'Instant Bank Pay'),
            type: isInstantPlusDD ? 'instant-plus-dd' : 'ibp',
            created_at: new Date().toISOString(),
          });
        }
      }

      // Do NOT delete temp:br here — the webhook worker needs it to read sub config
      // for hosted Instant+DD flows. The worker handles cleanup after creating the subscription.
    }

    res.json(br);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to get billing request' });
  }
});

// GET /:id/institutions — List available institutions for IBP (FasterPayments only)
router.get('/:id/institutions', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { country_code = 'GB' } = req.query as { country_code?: string };
    const data = await gcFetch<{ institutions: unknown[] }>(
      `/billing_requests/${id}/institutions?country_code=${country_code}`
    );

    console.log("GET Institution");
    console.log(data);
    res.json(data.institutions ?? []);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to list institutions' });
  }
});

// POST /:id/select-institution — Select institution for IBP
router.post('/:id/select-institution', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { institution, country_code } = req.body as { institution: string; country_code: string };
    const data = await gcFetch<BillingRequestResponse>(
      `/billing_requests/${id}/actions/select_institution`,
      { method: 'POST', body: { data: { institution, country_code } } }
    );

    console.log("Selct Institution");
    console.log(data);
    res.json(data.billing_requests);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to select institution' });
  }
});

// Step 1 — Create billing request (mandate, payment, or instant-plus-dd)
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      payment_type = 'mandate',
      amount,
      currency = 'EUR',
      scheme = 'sepa_core',
      sub_name,
      sub_amount,
      sub_interval,
      sub_interval_unit,
      sub_currency,
    } = req.body as {
      payment_type?: 'mandate' | 'payment' | 'instant-plus-dd';
      amount?: number;
      currency?: string;
      scheme?: string;
      sub_name?: string;
      sub_amount?: string;
      sub_interval?: string;
      sub_interval_unit?: string;
      sub_currency?: string;
    };

    // payment_type 'payment' — Instant Bank Pay (FasterPayments only)
    // payment_type 'instant-plus-dd' — combined IBP (FasterPayments) + Bacs DD mandate
    // default — DD mandate for the specified scheme/currency
    let billingRequestBody: object;
    if (payment_type === 'payment') {
      billingRequestBody = { billing_requests: { payment_request: { description: 'Instant Bank Pay', amount: amount ?? 1000, currency, scheme: 'faster_payments' } } };
    } else if (payment_type === 'instant-plus-dd') {
      billingRequestBody = {
        billing_requests: {
          payment_request: { description: 'Instant Bank Pay', amount: amount ?? 1000, currency: 'GBP', scheme: 'faster_payments' },
          mandate_request: { scheme: 'bacs', currency: 'GBP' },
        },
      };
    } else {
      billingRequestBody = { billing_requests: { mandate_request: { scheme, currency } } };
    }

    const data = await gcFetch<BillingRequestResponse>('/billing_requests', {
      method: 'POST',
      body: billingRequestBody,
    });

    const brId = data.billing_requests.id;

    // Save subscription config to temp:br so the webhook worker can create the
    // subscription after billing_requests.fulfilled fires (Custom Instant+DD path).
    if (payment_type === 'instant-plus-dd' && sub_name && sub_amount) {
      await saveTempBrSubConfig(brId, {
        sub_name,
        sub_amount,
        sub_interval: sub_interval ?? '1',
        sub_interval_unit: sub_interval_unit ?? 'monthly',
        sub_currency: sub_currency ?? 'GBP',
      });
    }

    res.status(201).json(data.billing_requests);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to create billing request' });
  }
});

// Step 2 — Collect customer details
router.post('/:id/collect-customer-details', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { given_name, family_name, email, address_line1, city, postal_code, country_code } =
      req.body as {
        given_name: string;
        family_name: string;
        email: string;
        address_line1: string;
        city: string;
        postal_code: string;
        country_code: string;
      };

   console.log("CUSTOMER DETAILS -- MANDATE ID");
  console.log(id);

    const data = await gcFetch<BillingRequestResponse>(
      `/billing_requests/${id}/actions/collect_customer_details`,
      {
        method: 'POST',
        body: {
          data: {
            customer: { email, given_name, family_name },
            customer_billing_detail: { address_line1, city, postal_code, country_code },
          },
        },
      }
    );

    await saveTempBrDetails(id, { given_name, family_name, email });

    res.json(data.billing_requests);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to collect customer details' });
  }
});

// Step 3 — Collect bank account
router.post('/:id/collect-bank-account', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { account_holder_name, country_code, ...bankFields } = req.body as Record<string, string>;

    const data = await gcFetch<BillingRequestResponse>(
      `/billing_requests/${id}/actions/collect_bank_account`,
      {
        method: 'POST',
        body: {
          data: { country_code, account_holder_name, ...bankFields },
        },
      }
    );
    res.json(data.billing_requests);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to collect bank account' });
  }
});

// Step 4 — Confirm payer details
router.post('/:id/confirm-payer-details', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = await gcFetch<BillingRequestResponse>(
      `/billing_requests/${id}/actions/confirm_payer_details`,
      { method: 'POST', body: {} }
    );
    res.json(data.billing_requests);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to confirm payer details' });
  }
});

// Step 5 — Fulfil billing request → returns mandate ID in links
router.post('/:id/fulfil', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = await gcFetch<BillingRequestResponse>(
      `/billing_requests/${id}/actions/fulfil`,
      { method: 'POST', body: {} }
    );

    const br = data.billing_requests;
    const mandateId = br.links.mandate_request_mandate;
    const customerId = (br.links as Record<string, string>).customer;

    if (mandateId && customerId) {
      const temp = await getTempBrDetails(id);
      const gcCustomer = br.resources?.customer;
      await upsertCustomer({
        id: customerId,
        name: gcCustomer
          ? `${gcCustomer.given_name ?? ''} ${gcCustomer.family_name ?? ''}`.trim() || 'Unknown'
          : temp
            ? `${temp.given_name} ${temp.family_name}`
            : 'Unknown',
        email: gcCustomer?.email ?? temp?.email ?? '',
        created_at: new Date().toISOString(),
      });
      await upsertMandate({
        id: mandateId,
        state: 'created',
        customer_id: customerId,
        scheme: (br as unknown as Record<string, unknown>).mandate_request
          ? ((br as unknown as Record<string, unknown>).mandate_request as Record<string, string>).scheme ?? 'unknown'
          : 'unknown',
        created_at: new Date().toISOString(),
      });
      await deleteTempBrDetails(id);
    }

    res.json(br);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fulfil billing request' });
  }
});

export default router;
