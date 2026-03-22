import type { NextFunction, Request, Response } from 'express';
import type { z } from 'zod';

export const validateBody = <T extends z.ZodTypeAny>(schema: T) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({ error: 'Invalid payload', issues: result.error.flatten() });
      return;
    }

    req.body = result.data;
    next();
  };
};
