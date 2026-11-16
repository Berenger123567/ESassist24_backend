import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),

    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1).optional().or(z.literal('')),

    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).default(900),
    REFRESH_TTL_DAYS: z.coerce.number().int().min(1).default(30),
    REFRESH_TOKEN_PEPPER: z.string().min(16),

    OTP_TTL_SECONDS: z.coerce.number().int().min(60).default(300),
    OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(3),
    OTP_REQUEST_COOLDOWN_SECONDS: z.coerce.number().int().min(10).default(60),
    OTP_MAX_PER_PHONE_PER_HOUR: z.coerce.number().int().min(1).default(5),
    OTP_MAX_PER_IP_PER_HOUR: z.coerce.number().int().min(1).default(10),
    OTP_FIXED_CODE: z
      .string()
      .regex(/^\d{6}$/)
      .optional()
      .or(z.literal('')),
    OTP_FIXED_PHONES: z.string().default(''),

    ADMIN_PHONE: z.string().optional().or(z.literal('')),
    CORS_ORIGINS: z.string().default(''),

    AUTH_COOKIE_DOMAIN: z.string().optional().or(z.literal('')),
    AUTH_COOKIE_SECURE: z.enum(['true', 'false']).default('false'),
    AUTH_COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  })
  .superRefine((env, ctx) => {
    if (env.AUTH_COOKIE_SAMESITE === 'none' && env.AUTH_COOKIE_SECURE !== 'true') {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_COOKIE_SECURE'],
        message: 'AUTH_COOKIE_SECURE=true est obligatoire avec SameSite=None.',
      });
    }

    if (env.NODE_ENV === 'production') {
      if (env.OTP_FIXED_CODE) {
        ctx.addIssue({
          code: 'custom',
          path: ['OTP_FIXED_CODE'],
          message: 'OTP_FIXED_CODE est interdit en production.',
        });
      }
      if (env.AUTH_COOKIE_SECURE !== 'true') {
        ctx.addIssue({
          code: 'custom',
          path: ['AUTH_COOKIE_SECURE'],
          message: 'AUTH_COOKIE_SECURE=true est obligatoire en production.',
        });
      }
      if (env.JWT_ACCESS_SECRET.startsWith('change-me')) {
        ctx.addIssue({
          code: 'custom',
          path: ['JWT_ACCESS_SECRET'],
          message: 'Le secret JWT par défaut est interdit en production.',
        });
      }
      if (env.REFRESH_TOKEN_PEPPER.startsWith('change-me')) {
        ctx.addIssue({
          code: 'custom',
          path: ['REFRESH_TOKEN_PEPPER'],
          message: 'Le pepper de refresh token par défaut est interdit en production.',
        });
      }
    }
  });

export type AppEnv = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): AppEnv {
  const input = { ...raw };
  if (!input.NODE_ENV) {
    input.NODE_ENV = 'development';
  }

  if (input.NODE_ENV === 'test') {
    input.DATABASE_URL ??= 'postgresql://electro:electro@localhost:5432/electro_assist_test';
    input.JWT_ACCESS_SECRET ??= 'test-access-secret-at-least-32-characters';
    input.REFRESH_TOKEN_PEPPER ??= 'test-refresh-pepper-16';
    input.OTP_FIXED_CODE ??= '123456';
    input.REDIS_URL ??= '';
  }

  const result = envSchema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Configuration invalide: ${issues}`);
  }

  return result.data;
}
