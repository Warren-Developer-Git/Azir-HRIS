-- Idempotent Supabase / Cloud PostgreSQL bootstrap for RLS role permissions.
-- Run this once in Supabase SQL Editor BEFORE `pnpm --filter api exec prisma migrate deploy`.
-- Replace the placeholder password with a strong secret password and match it in APP_DATABASE_URL.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'hrms_app') THEN
    CREATE ROLE hrms_app LOGIN PASSWORD 'CHANGE_ME_STRONG_APP_PASSWORD';
  END IF;
END $$;
