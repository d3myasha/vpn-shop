import { Router } from 'express';
import { subscriptionController, createSubscriptionSchema } from '../controllers/subscription.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';

const router = Router();

router.post('/create', requireAuth, validateBody(createSubscriptionSchema), (req, res, next) => {
  subscriptionController.create(req, res).catch(next);
});

router.get('/me', requireAuth, (req, res, next) => {
  subscriptionController.mySubscription(req, res).catch(next);
});

export default router;
