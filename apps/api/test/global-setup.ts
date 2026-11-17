process.env.APP_DATABASE_URL =
  process.env.TEST_APP_DATABASE_URL ||
  'postgresql://hrms_app:hrms_app_dev@localhost:5432/hrms_test';
process.env.OWNER_DATABASE_URL =
  process.env.TEST_OWNER_DATABASE_URL ||
  'postgresql://hrms_owner:hrms_owner_dev@localhost:5432/hrms_test';
process.env.DATABASE_URL =
  process.env.TEST_OWNER_DATABASE_URL ||
  'postgresql://hrms_owner:hrms_owner_dev@localhost:5432/hrms_test';

// Keep E2E tests hermetic so real SMTP / Resend credentials in .env never dispatch live test emails
// (Assign empty strings rather than `delete` so Prisma/dotenv does not re-populate them from .env)
process.env.SMTP_USER = '';
process.env.SMTP_PASS = '';
process.env.RESEND_API_KEY = '';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_ROLE_KEY = '';
process.env.SUPABASE_STORAGE_BUCKET = '';
