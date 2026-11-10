import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service.js';

const TEST_OWNER_URL =
  process.env.TEST_OWNER_DATABASE_URL ||
  'postgresql://hrms_owner:hrms_owner_dev@localhost:5432/hrms_test';
const TEST_APP_URL =
  process.env.TEST_APP_DATABASE_URL ||
  'postgresql://hrms_app:hrms_app_dev@localhost:5432/hrms_test';

export function createOwnerPrisma(): PrismaClient {
  return new PrismaClient({
    datasources: {
      db: { url: TEST_OWNER_URL },
    },
  });
}

export function createAppPrisma(): PrismaService {
  return new PrismaService({
    datasources: {
      db: { url: TEST_APP_URL },
    },
  });
}
