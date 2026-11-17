-- Idempotent Supabase / Cloud PostgreSQL bootstrap for RLS role permissions & UUIDv7 compatibility.
-- Run this once in Supabase SQL Editor BEFORE `pnpm --filter api exec prisma migrate deploy`.
-- Replace the placeholder password with a strong secret password and match it in APP_DATABASE_URL.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'hrms_app') THEN
    CREATE ROLE hrms_app LOGIN PASSWORD 'CHANGE_ME_STRONG_APP_PASSWORD';
  END IF;
END $$;

-- Provide RFC 9562 uuidv7() when deploying to managed PostgreSQL versions older than 18.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'uuidv7') THEN
    CREATE FUNCTION public.uuidv7() RETURNS uuid
    LANGUAGE sql VOLATILE AS $func$
      WITH base AS (
        SELECT overlay(
          uuid_send(gen_random_uuid())
          placing substring(int8send((extract(epoch from clock_timestamp()) * 1000)::bigint) from 3 for 6)
          from 1 for 6
        ) AS bytes
      ),
      versioned AS (
        SELECT set_byte(bytes, 6, (get_byte(bytes, 6) & 15) | 112) AS bytes
        FROM base
      ),
      variant AS (
        SELECT set_byte(bytes, 8, (get_byte(bytes, 8) & 63) | 128) AS bytes
        FROM versioned
      )
      SELECT encode(bytes, 'hex')::uuid FROM variant;
    $func$;
  END IF;
END $$;
