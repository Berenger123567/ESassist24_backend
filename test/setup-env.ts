process.env.NODE_ENV = 'test';
process.env.PORT = process.env.PORT || '3000';
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://postgres:berenger123@localhost:5432/electro_assist';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || 'access-secret-test-000000000000000000';
process.env.REFRESH_TOKEN_PEPPER =
  process.env.REFRESH_TOKEN_PEPPER || 'pepper-test-00000000000000000000';
process.env.JWT_ACCESS_TTL_SECONDS = process.env.JWT_ACCESS_TTL_SECONDS || '900';
process.env.REFRESH_TTL_DAYS = process.env.REFRESH_TTL_DAYS || '30';
process.env.OTP_TTL_SECONDS = process.env.OTP_TTL_SECONDS || '300';
process.env.OTP_MAX_ATTEMPTS = process.env.OTP_MAX_ATTEMPTS || '3';
process.env.OTP_MAX_PER_DEVICE_PER_HOUR = process.env.OTP_MAX_PER_DEVICE_PER_HOUR || '5';
process.env.OTP_REQUEST_COOLDOWN_SECONDS = process.env.OTP_REQUEST_COOLDOWN_SECONDS || '60';
process.env.ADMIN_PHONE = process.env.ADMIN_PHONE || '+22900000004';
process.env.ADMIN_BOOTSTRAP_PASSWORD = process.env.ADMIN_BOOTSTRAP_PASSWORD || 'AdminTest123!';
process.env.DOCUMENT_SIGNING_SECRET =
  process.env.DOCUMENT_SIGNING_SECRET || 'test-document-signing-secret-at-least-32';
process.env.DOCUMENT_STORAGE_DIR = process.env.DOCUMENT_STORAGE_DIR || './.tmp-document-storage';
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || 'http://localhost:3000';
process.env.OTP_FIXED_CODE = process.env.OTP_FIXED_CODE || '123456';
// Vide => code fixe accepté pour tout numéro en test/dev (nécessaire pour e2e dynamiques)
process.env.OTP_FIXED_PHONES = process.env.OTP_FIXED_PHONES || '';
