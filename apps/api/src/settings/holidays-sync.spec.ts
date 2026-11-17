import 'reflect-metadata';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BadGatewayException,
  BadRequestException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { HolidaysController } from './holidays.controller.js';
import { HolidaysService } from './holidays.service.js';
import {
  PublicHolidayApiService,
  classifyPhilippineHolidayType,
} from './public-holiday-api.service.js';

describe('PublicHolidayApiService & Classification', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('classifies Philippine special non-working vs regular holidays accurately', () => {
    expect(classifyPhilippineHolidayType("New Year's Day")).toBe('REGULAR');
    expect(classifyPhilippineHolidayType('Bonifacio Day')).toBe('REGULAR');
    expect(classifyPhilippineHolidayType('Chinese New Year')).toBe('SPECIAL');
    expect(classifyPhilippineHolidayType('Ninoy Aquino Day')).toBe('SPECIAL');
    expect(classifyPhilippineHolidayType("All Saints' Day")).toBe('SPECIAL');
    expect(classifyPhilippineHolidayType('Black Saturday')).toBe('SPECIAL');
  });

  it('parses valid external holiday items from Nager.Date API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify([
            {
              date: '2026-01-01',
              name: "New Year's Day",
              localName: 'Bagong Taon',
              countryCode: 'PH',
              global: true,
              types: ['Public'],
            },
            {
              date: 'invalid-date',
              name: 'Bad Row',
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    const svc = new PublicHolidayApiService();
    const res = await svc.fetchPublicHolidays(2026, 'ph');

    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({
      date: '2026-01-01',
      name: "New Year's Day",
      localName: 'Bagong Taon',
      countryCode: 'PH',
    });
  });

  it('throws NotFoundException when external API returns 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Not found', { status: 404 })),
    );

    const svc = new PublicHolidayApiService();
    await expect(svc.fetchPublicHolidays(2026, 'ZZ')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws BadGatewayException on network/timeout failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network timeout')),
    );

    const svc = new PublicHolidayApiService();
    await expect(svc.fetchPublicHolidays(2026, 'PH')).rejects.toThrow(
      BadGatewayException,
    );
  });

  it('rejects malformed year strings like "2026abc" in HolidaysController.previewExternalHolidays', async () => {
    const mockHolidaysService = {
      previewExternalHolidays: vi.fn().mockResolvedValue({ count: 0, holidays: [] }),
    } as unknown as HolidaysService;

    const controller = new HolidaysController(mockHolidaysService);
    const paramTypes = Reflect.getMetadata(
      'design:paramtypes',
      HolidaysController.prototype,
      'previewExternalHolidays',
    ) as unknown[] | undefined;
    const queryMetatype = paramTypes?.[0] as any;
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });

    await expect(
      (async () => {
        const transformed = await pipe.transform(
          { year: '2026abc', countryCode: 'PH' },
          { type: 'query', metatype: queryMetatype },
        );
        return (controller.previewExternalHolidays as any)(transformed);
      })(),
    ).rejects.toThrow(BadRequestException);
  });
});
