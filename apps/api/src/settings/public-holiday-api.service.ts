import {
  BadGatewayException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { HolidayType } from '@prisma/client';

export interface ExternalHolidayItem {
  date: string;
  name: string;
  localName?: string;
  countryCode: string;
  global: boolean;
  types: string[];
}

const SPECIAL_PH_HOLIDAY_KEYWORDS = [
  'chinese new year',
  'edsa',
  'people power',
  'black saturday',
  'ninoy aquino',
  'all saints',
  'all souls',
  'immaculate conception',
  'christmas eve',
  'last day of the year',
  "new year's eve",
];

/**
 * Maps public holiday names to Philippine statutory HolidayType (REGULAR vs SPECIAL).
 */
export function classifyPhilippineHolidayType(name: string): HolidayType {
  const normalized = name.toLowerCase();
  const isSpecial = SPECIAL_PH_HOLIDAY_KEYWORDS.some((keyword) =>
    normalized.includes(keyword),
  );
  return isSpecial ? 'SPECIAL' : 'REGULAR';
}

@Injectable()
export class PublicHolidayApiService {
  private readonly baseUrl = 'https://date.nager.at/api/v3/PublicHolidays';

  async fetchPublicHolidays(
    year: number,
    countryCode = 'PH',
  ): Promise<ExternalHolidayItem[]> {
    const normalizedCountry = countryCode.trim().toUpperCase();
    const url = `${this.baseUrl}/${year}/${normalizedCountry}`;

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'Network or timeout error';
      throw new BadGatewayException(
        `Unable to reach external Nager.Date Holiday API: ${reason}`,
      );
    }

    if (response.status === 404) {
      throw new NotFoundException(
        `No public holidays found in external API for ${normalizedCountry} (${year})`,
      );
    }

    if (!response.ok) {
      throw new BadGatewayException(
        `External Nager.Date Holiday API responded with HTTP ${response.status}`,
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new BadGatewayException(
        'External Nager.Date Holiday API returned invalid JSON',
      );
    }

    if (!Array.isArray(payload)) {
      throw new BadGatewayException(
        'External Nager.Date Holiday API returned an unexpected payload shape',
      );
    }

    return payload
      .filter(
        (item): item is Record<string, unknown> =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as Record<string, unknown>).date === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(
            (item as Record<string, unknown>).date as string,
          ) &&
          typeof (item as Record<string, unknown>).name === 'string',
      )
      .map((item) => ({
        date: String(item.date),
        name: String(item.name).trim(),
        localName:
          typeof item.localName === 'string' ? item.localName.trim() : undefined,
        countryCode:
          typeof item.countryCode === 'string'
            ? item.countryCode.toUpperCase()
            : normalizedCountry,
        global: typeof item.global === 'boolean' ? item.global : true,
        types: Array.isArray(item.types)
          ? item.types.filter((t): t is string => typeof t === 'string')
          : ['Public'],
      }));
  }
}
