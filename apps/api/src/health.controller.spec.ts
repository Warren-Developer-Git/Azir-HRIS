import { describe, beforeEach, it, expect, vi } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  let controller: HealthController;
  let prismaMock: { $queryRaw: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    prismaMock = {
      $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    };
    controller = new HealthController(prismaMock as any);
  });

  it('should return ok on liveness check', () => {
    expect(controller.check()).toEqual({ ok: true });
  });

  it('returns ok and database: up on ready() when SELECT 1 succeeds', async () => {
    await expect(controller.ready()).resolves.toEqual({
      ok: true,
      database: 'up',
    });
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('throws ServiceUnavailableException on ready() when database check fails', async () => {
    prismaMock.$queryRaw.mockRejectedValueOnce(new Error('DB connection refused'));
    await expect(controller.ready()).rejects.toThrow(ServiceUnavailableException);
  });
});
