import { Router } from 'express';
import { Role } from '@prisma/client';
import { adminController } from '../controllers/admin.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';

const router = Router();

router.use(requireAuth, requireRole([Role.admin]));

router.get('/stats', (req, res, next) => {
  adminController.stats(req, res).catch(next);
});

router.get('/users', (req, res, next) => {
  adminController.users(req, res).catch(next);
});

export default router;
