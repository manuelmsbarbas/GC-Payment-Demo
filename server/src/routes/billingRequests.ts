import { Router, Request, Response } from 'express';
import { gcFetch } from '../services/gocardless';
import {
  saveTempBrDetails,
  getTempBrDetails,
  deleteTempBrDetails,
  upsertCustomer,
  upsertMandate,
  upsertPayment,
} from '../services/redisStore';

const router = Router();

interface BillingRequestResponse {
  billing_requests: {
    id: string;
    status: string;
    links: { mandate_request_mandate?: string; payment_request_payment?: string };
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
      await upsertCustomer({
        id: customerId,
        name: temp ? `${temp.given_name} ${temp.family_name}` : 'Unknown',
        email: temp?.email ?? '',
        created_at: new Date().toISOString(),
      });

      if (mandateId) {
        const brFull = br as unknown as Record<string, unknown>;
        const mandateReq = brFull.mandate_request as Record<string, string> | undefined;
        await upsertMandate({
          id: mandateId,
          state: 'created',
          customer_id: customerId,
          scheme: mandateReq?.scheme ?? 'unknown',
          created_at: new Date().toISOString(),
        });
      }

      if (paymentId) {
        const brFull = br as unknown as Record<string, unknown>;
        const paymentReq = brFull.payment_request as Record<string, unknown> | undefined;
        const isInstantPlusDD = !!mandateId;
        await upsertPayment({
          id: paymentId,
          state: 'created',
          // For IBP, use customerId as mandate_id placeholder since there is no mandate
          mandate_id: mandateId ?? customerId,
          amount: Number(paymentReq?.amount ?? 0),
          currency: String(paymentReq?.currency ?? 'GBP'),
          description: String(paymentReq?.description ?? 'Instant Bank Pay'),
          type: isInstantPlusDD ? 'instant-plus-dd' : 'ibp',
          created_at: new Date().toISOString(),
        });
      }

      await deleteTempBrDetails(id);
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
    const { payment_type = 'mandate', amount, currency = 'EUR', scheme = 'sepa_core' } = req.body as {
      payment_type?: 'mandate' | 'payment' | 'instant-plus-dd';
      amount?: number;
      currency?: string;
      scheme?: string;
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


    console.log("BILLING REQUEST -  data");
    console.log(data);

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
      await upsertCustomer({
        id: customerId,
        name: temp ? `${temp.given_name} ${temp.family_name}` : 'Unknown',
        email: temp?.email ?? '',
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
