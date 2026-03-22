import { Router } from 'express';
import { authController, authBodySchema } from '../controllers/auth.controller.js';
import { validateBody } from '../middleware/validate.middleware.js';

const router = Router();

router.post('/register', validateBody(authBodySchema), (req, res, next) => {
  authController.register(req, res).catch(next);
});

router.post('/login', validateBody(authBodySchema), (req, res, next) => {
  authController.login(req, res).catch(next);
});

router.post('/refresh', (req, res, next) => {
  Promise.resolve(authController.refresh(req, res)).catch(next);
});

router.post('/logout', (req, res, next) => {
  Promise.resolve(authController.logout(req, res)).catch(next);
});

export default router;
