import type { Request, Response } from 'express';
import { z } from 'zod';
import { authService } from '../services/auth.service.js';
import { clearAuthCookies, setAuthCookies } from '../utils/http.js';

export const authBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72)
});

export class AuthController {
  async register(req: Request, res: Response) {
    const { email, password } = req.body as z.infer<typeof authBodySchema>;
    const result = await authService.register(email, password);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    res.status(201).json({ user: result.user });
  }

  async login(req: Request, res: Response) {
    const { email, password } = req.body as z.infer<typeof authBodySchema>;
    const result = await authService.login(email, password);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    res.status(200).json({ user: result.user });
  }

  refresh(req: Request, res: Response) {
    const refreshToken = req.cookies?.refresh_token as string | undefined;
    if (!refreshToken) {
      res.status(401).json({ error: 'Refresh token is missing' });
      return;
    }

    const result = authService.refresh(refreshToken);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    res.status(200).json({ user: result.user });
  }

  logout(_req: Request, res: Response) {
    clearAuthCookies(res);
    res.status(200).json({ ok: true });
  }
}

export const authController = new AuthController();
