import { Router } from 'express';
import { Role } from '@prisma/client';
import { planController, createPlanSchema } from '../controllers/plan.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';

const router = Router();

router.get('/', (req, res, next) => {
  planController.listPublic(req, res).catch(next);
});

router.get('/admin', requireAuth, requireRole([Role.admin]), (req, res, next) => {
  planController.listAdmin(req, res).catch(next);
});

router.post('/admin', requireAuth, requireRole([Role.admin]), validateBody(createPlanSchema), (req, res, next) => {
  planController.create(req, res).catch(next);
});

export default router;
