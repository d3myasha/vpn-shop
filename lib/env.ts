import { z } from "zod";

const baseEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(1).optional(),
  NEXTAUTH_SECRET: z.string().min(1).optional(),
  CHECKOUT_ENABLED: z.enum(["true", "false"]).default("true"),
  REFERRAL_INVITER_BONUS_DAYS: z.coerce.number().int().positive().default(7),
  REFERRAL_INVITED_BONUS_DAYS: z.coerce.number().int().positive().default(3),
});

const yookassaEnvSchema = z.object({
  YOOKASSA_SHOP_ID: z.string().min(1),
  YOOKASSA_SECRET_KEY: z.string().min(1),
  YOOKASSA_RETURN_URL: z.string().url(),
});

const remnawaveEnvSchema = z.object({
  REMNAWAVE_API_URL: z.string().url(),
  REMNAWAVE_API_KEY: z.string().min(1),
  REMNAWAVE_API_HEADER_NAME: z.string().min(1).default("Authorization"),
  REMNAWAVE_API_HEADER_PREFIX: z.string().optional().default("Bearer"),
});

const authEnvSchema = z
  .object({
    AUTH_SECRET: z.string().min(1).optional(),
    NEXTAUTH_SECRET: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.AUTH_SECRET && !value.NEXTAUTH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "AUTH_SECRET или NEXTAUTH_SECRET должен быть задан",
      });
    }
  });

type BaseEnv = z.infer<typeof baseEnvSchema>;
type YookassaEnv = z.infer<typeof yookassaEnvSchema>;
type RemnawaveEnv = z.infer<typeof remnawaveEnvSchema>;
type AuthEnv = z.infer<typeof authEnvSchema>;
type AppEnv = BaseEnv & AuthEnv;

let cachedBaseEnv: BaseEnv | null = null;
let cachedAuthEnv: AuthEnv | null = null;
let cachedYookassaEnv: YookassaEnv | null = null;
let cachedRemnawaveEnv: RemnawaveEnv | null = null;

export function getBaseEnv() {
  if (!cachedBaseEnv) {
    cachedBaseEnv = baseEnvSchema.parse(process.env);
  }
  return cachedBaseEnv;
}

export function getAuthEnv() {
  if (!cachedAuthEnv) {
    cachedAuthEnv = authEnvSchema.parse(process.env);
  }
  return cachedAuthEnv;
}

export function getYookassaEnv() {
  if (!cachedYookassaEnv) {
    cachedYookassaEnv = yookassaEnvSchema.parse(process.env);
  }
  return cachedYookassaEnv;
}

export function getRemnawaveEnv() {
  if (!cachedRemnawaveEnv) {
    cachedRemnawaveEnv = remnawaveEnvSchema.parse(process.env);
  }
  return cachedRemnawaveEnv;
}

export function getEnv(): AppEnv {
  return {
    ...getBaseEnv(),
    ...getAuthEnv(),
  };
}
