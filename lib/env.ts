import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  NEXTAUTH_SECRET: z.string().min(1).optional(),
  YOOKASSA_SHOP_ID: z.string().min(1),
  YOOKASSA_SECRET_KEY: z.string().min(1),
  YOOKASSA_RETURN_URL: z.string().url(),
  REMNAWAVE_API_URL: z.string().url(),
  REMNAWAVE_API_KEY: z.string().min(1),
  REFERRAL_INVITER_BONUS_DAYS: z.coerce.number().int().positive().default(7),
  REFERRAL_INVITED_BONUS_DAYS: z.coerce.number().int().positive().default(3)
});

let cachedEnv: z.infer<typeof envSchema> | null = null;

export function getEnv() {
  if (!cachedEnv) {
    cachedEnv = envSchema.parse(process.env);
  }
  return cachedEnv;
}
