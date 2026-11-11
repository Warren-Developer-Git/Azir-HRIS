import {
  Injectable,
  Optional,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';

export interface LoginLookupResult {
  id: string;
  tenantId: string;
  passwordHash: string;
  active: boolean;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(@Optional() options?: Prisma.PrismaClientOptions) {
    super(
      options ?? {
        datasources: {
          db: {
            url:
              process.env.APP_DATABASE_URL ||
              'postgresql://hrms_app:hrms_app_dev@localhost:5432/hrms',
          },
        },
      },
    );
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  async withTenant<T>(
    tenantId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return fn(tx);
    });
  }

  async loginLookup(email: string): Promise<LoginLookupResult | null> {
    const rows = await this.$queryRaw<LoginLookupResult[]>`
      SELECT id, "tenantId", "passwordHash", active
      FROM app_login_lookup(${email})
    `;
    return rows[0] ?? null;
  }

  async verifyDocument(code: string): Promise<{
    documentNo: string;
    documentType: string;
    issuedAt: Date;
    status: string;
    organization: string;
    maskedEmployeeName: string;
  } | null> {
    const rows = await this.$queryRaw<
      Array<{
        documentNo: string;
        documentType: string;
        issuedAt: Date;
        status: string;
        organization: string;
        maskedEmployeeName: string;
      }>
    >`
      SELECT "documentNo", "documentType", "issuedAt", "status", "organization", "maskedEmployeeName"
      FROM app_verify_document(${code})
    `;
    return rows[0] ?? null;
  }
}
