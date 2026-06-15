import { Router, Request, Response } from 'express';
import { gcFetch } from '../services/gocardless';

const router = Router();

interface BillingRequestResponse {
  billing_requests: {
    id: string;
    status: string;
    links: { mandate_request_mandate?: string };
    [key: string]: unknown;
  };
}

// Step 1 — Create billing request
router.post('/', async (_req: Request, res: Response) => {
  try {
    const data = await gcFetch<BillingRequestResponse>('/billing_requests', {
      method: 'POST',
      body: {
        billing_requests: {
          mandate_request: { 
            scheme: 'sepa_core',
            currency: 'EUR'
          },
        },
      },
    });


   console.log("BILLING REQUEST -- DATA");
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
    res.json(data.billing_requests);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to collect customer details' });
  }
});

// Step 3 — Collect bank account
router.post('/:id/collect-bank-account', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { account_holder_name, iban, country_code } = req.body as {
      account_holder_name: string;
      iban: string;
      country_code: string;
    };


    console.log("BANK DETAILS -- MANDATE ID");
    console.log(id);

    const data = await gcFetch<BillingRequestResponse>(
      `/billing_requests/${id}/actions/collect_bank_account`,
      {
        method: 'POST',
        body: {
          data: { country_code, account_holder_name, iban },
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
    res.json(data.billing_requests);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fulfil billing request' });
  }
});

export default router;
