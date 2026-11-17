import { describe, expect, it, vi, afterEach } from 'vitest';
import { getJwtAccessSecret, getJwtRefreshSecret } from './jwt-secrets.js';
import { AuthService } from './auth.service.js';

describe('Auth Security Hardening (Findings 1 & 2)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('throws in production when JWT_ACCESS_SECRET or JWT_REFRESH_SECRET is missing', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_ACCESS_SECRET;
    delete process.env.JWT_REFRESH_SECRET;

    expect(() => getJwtAccessSecret()).toThrow(/JWT_ACCESS_SECRET/);
    expect(() => getJwtRefreshSecret()).toThrow(/JWT_REFRESH_SECRET/);
  });

  it('returns configured secrets in production when provided', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_ACCESS_SECRET = 'prod-access-secret-123';
    process.env.JWT_REFRESH_SECRET = 'prod-refresh-secret-456';

    expect(getJwtAccessSecret()).toBe('prod-access-secret-123');
    expect(getJwtRefreshSecret()).toBe('prod-refresh-secret-456');
  });

  it('logout clears refresh cookie with secure: true in production', () => {
    process.env.NODE_ENV = 'production';
    const service = new AuthService({} as any, {} as any, {} as any);
    const resMock = { clearCookie: vi.fn() };

    service.logout(resMock as any);

    expect(resMock.clearCookie).toHaveBeenCalledWith('refresh', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
    });
  });
});
