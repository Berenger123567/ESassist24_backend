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
    OTP_MAX_PER_DEVICE_PER_HOUR: z.coerce.number().int().min(1).default(5),
    OTP_FIXED_CODE: z
      .string()
      .regex(/^\d{6}$/)
      .optional()
      .or(z.literal('')),
    OTP_FIXED_PHONES: z.string().default(''),

    ADMIN_PHONE: z.string().optional().or(z.literal('')),
    ADMIN_BOOTSTRAP_PASSWORD: z.string().optional().or(z.literal('')),
    ADMIN_INVITE_TTL_SECONDS: z.coerce.number().int().min(60).default(604800),
    ADMIN_LOGIN_MAX_PER_HOUR: z.coerce.number().int().min(1).default(5),
    ADMIN_LOGIN_LOCK_MINUTES: z.coerce.number().int().min(1).default(15),
    ADMIN_MFA_TTL_SECONDS: z.coerce.number().int().min(30).default(300),
    TOTP_ISSUER: z.string().min(1).default('Electro Assist 24H'),
    CORS_ORIGINS: z.string().default(''),

    DOCUMENT_SIGNING_SECRET: z.string().min(32).default('change-me-document-signing-secret-32'),
    DOCUMENT_STORAGE_DIR: z.string().min(1).default('./storage/private'),
    DOCUMENT_MAX_UPLOAD_BYTES: z.coerce.number().int().min(1024).default(10485760),
    DOCUMENT_EXPIRY_DAYS: z.coerce.number().int().min(1).default(365),
    DOCUMENT_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(30).default(600),
    APP_VERSION: z.string().min(1).default('0.1.0'),
    CONTRAT_VERSION: z.string().min(1).default('1.1.0'),

    AUTH_COOKIE_DOMAIN: z.string().optional().or(z.literal('')),
    AUTH_COOKIE_SECURE: z.enum(['true', 'false']).default('false'),
    AUTH_COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),

    ADMIN_IP_ALLOWLIST: z.string().default(''),
    TRUST_PROXY_CIDR: z.string().default(''),
    ADMIN_IP_DEV_BYPASS: z.enum(['true', 'false']).default('false'),
    ADMIN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(120),
    ADMIN_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).default(60),
    ADMIN_VIEW_URL_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(20),
    VERIFICATION_SLA_HOURS: z.coerce.number().int().min(1).default(48),
    VERIFICATION_WORK_START_HOUR: z.coerce.number().int().min(0).max(23).default(8),
    VERIFICATION_WORK_END_HOUR: z.coerce.number().int().min(1).max(24).default(18),
    VERIFICATION_TIMEZONE: z.string().min(1).default('Africa/Porto-Novo'),
    VERIFICATION_HOLIDAYS: z.string().default(''),
    VERIFICATION_REMINDER_DAYS: z.string().default('30,14,7,1,0'),
    VERIFICATION_REMINDER_CRON: z.string().min(1).default('0 6 * * *'),
    VERIFICATION_REMINDERS_ENABLED: z.enum(['true', 'false']).default('true'),
    VERIFICATION_COMPLEMENT_GRACE_DAYS: z.coerce.number().int().min(1).default(30),
    VERIFICATION_VIEW_URL_TTL_SECONDS: z.coerce.number().int().min(30).max(600).default(300),
    VERIFICATION_DECISION_IDEMPOTENCY_TTL_SECONDS: z.coerce.number().int().min(60).default(86400),
    EVALUATION_PASS_PERCENT: z.coerce.number().int().min(1).max(100).default(70),
    ARRIVAL_CODE_TTL_SECONDS: z.coerce.number().int().min(30).default(600),
    ARRIVAL_CODE_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
    MISSION_POSITION_INTERVAL_SECONDS: z.coerce.number().int().min(1).default(30),
    MISSION_POSITION_TTL_HOURS: z.coerce.number().int().min(1).default(24),
    MISSION_POSITION_PURGE_CRON: z.string().min(1).default('0 3 * * *'),
    PRO_SEARCH_MAX_RADIUS_KM: z.coerce.number().int().min(1).max(200).default(50),
    PRO_SEARCH_MAX_LIMIT: z.coerce.number().int().min(1).max(100).default(50),
    FCM_PROJECT_ID: z.string().default(''),
    FCM_CLIENT_EMAIL: z.string().default(''),
    FCM_PRIVATE_KEY: z.string().default(''),
    FCM_SCOPE: z.string().default('https://www.googleapis.com/auth/firebase.messaging'),
    FCM_TOKEN_URL: z.string().default('https://oauth2.googleapis.com/token'),
    VAPID_PUBLIC_KEY: z.string().default(''),
    VAPID_PRIVATE_KEY: z.string().default(''),
    VAPID_SUBJECT: z.string().default('mailto:admin@electro-assist.local'),
    PUSH_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(3),
    BULLMQ_PREFIX: z.string().min(1).default('ea'),
    BULLMQ_REMOVE_ON_COMPLETE: z.coerce.number().int().min(0).default(100),
    BULLMQ_REMOVE_ON_FAIL: z.coerce.number().int().min(0).default(50),
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
      if (env.DOCUMENT_SIGNING_SECRET.startsWith('change-me')) {
        ctx.addIssue({
          code: 'custom',
          path: ['DOCUMENT_SIGNING_SECRET'],
          message: 'Le secret de signature documentaire par défaut est interdit en production.',
        });
      }
      if (!env.ADMIN_IP_ALLOWLIST.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['ADMIN_IP_ALLOWLIST'],
          message: 'ADMIN_IP_ALLOWLIST est obligatoire en production.',
        });
      }
      if (env.ADMIN_IP_DEV_BYPASS === 'true') {
        ctx.addIssue({
          code: 'custom',
          path: ['ADMIN_IP_DEV_BYPASS'],
          message: 'ADMIN_IP_DEV_BYPASS est interdit en production.',
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
    input.DOCUMENT_SIGNING_SECRET ??= 'test-document-signing-secret-at-least-32';
    input.ADMIN_BOOTSTRAP_PASSWORD ??= 'AdminTest123!';
    input.ADMIN_IP_ALLOWLIST ??= '';
    input.ADMIN_IP_DEV_BYPASS ??= 'true';
    input.VERIFICATION_REMINDERS_ENABLED ??= 'false';
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
