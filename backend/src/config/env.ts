import { config } from 'dotenv';
import { z } from 'zod';

config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  APP_URL: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  REMNAWAVE_API_URL: z.string().url().optional(),
  REMNAWAVE_API_KEY: z.string().optional(),
  YOOKASSA_SHOP_ID: z.string().optional(),
  YOOKASSA_SECRET_KEY: z.string().optional(),
  YOOKASSA_RETURN_URL: z.string().url().default('http://localhost:5173/payment/success'),
  YOOKASSA_WEBHOOK_SECRET: z.string().optional(),
  CORS_ORIGIN: z.string().url().default('http://localhost:5173')
});

export const env = envSchema.parse(process.env);
