import { Router } from 'express';
import billingRequestsRouter from './billingRequests';
import subscriptionsRouter from './subscriptions';
import paymentsRouter from './payments';
import instalmentSchedulesRouter from './instalmentSchedules';
import dropInRouter from './dropIn';
import hostedRouter from './hosted';
import bankAuthorisationsRouter from './bankAuthorisations';
import webhooksRouter from './webhooks';
import sseRouter from './sse';
import historyRouter from './history';

const router = Router();

router.use('/billing-requests', billingRequestsRouter);
router.use('/subscriptions', subscriptionsRouter);
router.use('/payments', paymentsRouter);
router.use('/instalment-schedules', instalmentSchedulesRouter);
router.use('/drop-in', dropInRouter);
router.use('/hosted', hostedRouter);
router.use('/bank-authorisations', bankAuthorisationsRouter);
router.use('/webhooks', webhooksRouter);
router.use('/events', sseRouter);
router.use('/history', historyRouter);

export default router;
