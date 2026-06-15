import { Router } from 'express';
import billingRequestsRouter from './billingRequests';
import subscriptionsRouter from './subscriptions';
import webhooksRouter from './webhooks';
import sseRouter from './sse';

const router = Router();

router.use('/billing-requests', billingRequestsRouter);
router.use('/subscriptions', subscriptionsRouter);
router.use('/webhooks', webhooksRouter);
router.use('/events', sseRouter);

export default router;
