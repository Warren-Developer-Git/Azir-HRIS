import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { RequestLoggerMiddleware } from './request-logger.middleware.js';

describe('RequestLoggerMiddleware', () => {
  function runRequest(statusCode: number) {
    const middleware = new RequestLoggerMiddleware();
    const logger = (middleware as any).logger;
    const logSpy = vi.spyOn(logger, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    const req = {
      method: 'POST',
      originalUrl: '/auth/login',
      url: '/auth/login',
      headers: { authorization: 'Bearer super-secret-jwt' },
      body: { password: 'MySecretPassword!' },
    } as any;

    const res = new EventEmitter() as any;
    res.statusCode = statusCode;
    const next = vi.fn();

    middleware.use(req, res, next);
    res.emit('finish');

    return { next, logSpy, warnSpy, errorSpy };
  }

  it('logs 2xx responses via logger.log without leaking auth headers or body secrets', () => {
    const { next, logSpy, warnSpy, errorSpy } = runRequest(200);

    expect(next).toHaveBeenCalledOnce();
    expect(logSpy).toHaveBeenCalledOnce();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    const msg = (logSpy.mock.calls[0]?.[0] as string | undefined) ?? '';
    expect(msg).toMatch(/^POST \/auth\/login 200 \(\d+\.\dms\)$/);
    expect(msg).not.toContain('super-secret-jwt');
    expect(msg).not.toContain('MySecretPassword!');
  });

  it('logs 4xx responses via logger.warn and 5xx responses via logger.error', () => {
    const clientErr = runRequest(429);
    expect(clientErr.warnSpy).toHaveBeenCalledOnce();
    expect((clientErr.warnSpy.mock.calls[0]?.[0] as string | undefined) ?? '').toContain('429');

    const serverErr = runRequest(500);
    expect(serverErr.errorSpy).toHaveBeenCalledOnce();
    expect((serverErr.errorSpy.mock.calls[0]?.[0] as string | undefined) ?? '').toContain('500');
  });
});
