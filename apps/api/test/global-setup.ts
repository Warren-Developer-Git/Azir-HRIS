process.env.APP_DATABASE_URL =
  process.env.TEST_APP_DATABASE_URL ||
  'postgresql://hrms_app:hrms_app_dev@localhost:5432/hrms_test';
process.env.OWNER_DATABASE_URL =
  process.env.TEST_OWNER_DATABASE_URL ||
  'postgresql://hrms_owner:hrms_owner_dev@localhost:5432/hrms_test';
process.env.DATABASE_URL =
  process.env.TEST_OWNER_DATABASE_URL ||
  'postgresql://hrms_owner:hrms_owner_dev@localhost:5432/hrms_test';
