import { Router, Request, Response } from 'express';
import {
  getAllCustomerIds,
  getCustomer,
  getMandatesByCustomer,
  getPaymentsByMandate,
  getSubscriptionsByMandate,
  getInstalmentSchedulesByMandate,
  getIbpPaymentsByCustomer,
} from '../services/redisStore';
import type { HistoryResponse, HistoryCustomer, HistoryMandate } from '../types/store';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const customerIds = await getAllCustomerIds();

    const customers: (HistoryCustomer | null)[] = await Promise.all(
      customerIds.map(async (customerId) => {
        const customer = await getCustomer(customerId);
        if (!customer) return null;

        const mandates = await getMandatesByCustomer(customerId);
        const ibpPayments = await getIbpPaymentsByCustomer(customerId);

        const hydratedMandates: HistoryMandate[] = await Promise.all(
          mandates.map(async (mandate) => ({
            ...mandate,
            payments: await getPaymentsByMandate(mandate.id),
            subscriptions: await getSubscriptionsByMandate(mandate.id),
            instalment_schedules: await getInstalmentSchedulesByMandate(mandate.id),
          }))
        );

        return {
          ...customer,
          mandates: hydratedMandates,
          ibp_payments: ibpPayments,
        } satisfies HistoryCustomer;
      })
    );

    const result: HistoryResponse = {
      customers: customers.filter((c): c is HistoryCustomer => c !== null),
    };

    res.json(result);
  } catch (err) {
    console.error('[history]', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load history' });
  }
});

export default router;
