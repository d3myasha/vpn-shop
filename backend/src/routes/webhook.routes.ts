import { Router } from 'express';
import { webhookController } from '../controllers/webhook.controller.js';

const router = Router();

router.post('/yookassa', (req, res, next) => {
  webhookController.yookassa(req, res).catch(next);
});

export default router;
