import {
  Controller,
  Get,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Public } from './auth/decorators.js';
import { PrismaService } from './prisma/prisma.service.js';

@Controller('health')
export class HealthController {
  constructor(@Optional() private readonly prisma?: PrismaService) {}

  @Public()
  @Get()
  check() {
    return { ok: true };
  }

  @Public()
  @Get('ready')
  async ready() {
    if (!this.prisma) {
      throw new ServiceUnavailableException('Database client unavailable');
    }

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true, database: 'up' };
    } catch {
      throw new ServiceUnavailableException('Database unavailable');
    }
  }
}
