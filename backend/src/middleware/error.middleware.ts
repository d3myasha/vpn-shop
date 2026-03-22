import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export const errorHandler = (error: unknown, _req: Request, res: Response, _next: NextFunction): void => {
  if (error instanceof ZodError) {
    res.status(400).json({ error: 'Validation error', issues: error.flatten() });
    return;
  }

  if (error instanceof Error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(500).json({ error: 'Unknown server error' });
};
