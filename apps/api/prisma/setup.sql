-- Setup roles and databases for HRMS

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'hrms_owner') THEN
    CREATE ROLE hrms_owner LOGIN CREATEDB PASSWORD 'hrms_owner_dev';
  ELSE
    ALTER ROLE hrms_owner WITH LOGIN CREATEDB PASSWORD 'hrms_owner_dev';
  END IF;

  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'hrms_app') THEN
    CREATE ROLE hrms_app LOGIN PASSWORD 'hrms_app_dev';
  ELSE
    ALTER ROLE hrms_app WITH LOGIN PASSWORD 'hrms_app_dev';
  END IF;
END $$;

SELECT 'CREATE DATABASE hrms OWNER hrms_owner'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'hrms')\gexec

SELECT 'CREATE DATABASE hrms_test OWNER hrms_owner'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'hrms_test')\gexec

GRANT ALL PRIVILEGES ON DATABASE hrms TO hrms_owner;
GRANT ALL PRIVILEGES ON DATABASE hrms_test TO hrms_owner;
