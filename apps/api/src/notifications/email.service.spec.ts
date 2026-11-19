import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailService, buildGmailRawMessage } from './email.service.js';

const EMAIL_ENV_KEYS = [
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'RESEND_API_KEY',
  'EMAIL_FROM',
  'EMAIL_PROVIDER',
  'EMAIL_DEMO_OVERRIDE',
  'GMAIL_CLIENT_ID',
  'GMAIL_CLIENT_SECRET',
  'GMAIL_REFRESH_TOKEN',
  'GMAIL_SENDER_EMAIL',
] as const;

describe('buildGmailRawMessage', () => {
  it('encodes multipart/alternative MIME as base64url and strips header CRLF injection', () => {
    const raw = buildGmailRawMessage({
      from: '"Azir HRIS"\r\nBcc: attacker@evil.test <hr@azir.test>',
      to: 'friend@gmail.com\r\nCc: leak@evil.test',
      subject: 'Meeting Invite — HR Sync\r\nX-Injected: bad',
      text: 'Plain body',
      html: '<p>HTML body</p>',
    });

    expect(raw).not.toMatch(/[+/=]/);
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    const separatorIdx = decoded.indexOf('\r\n\r\n');
    const headers = decoded.slice(0, separatorIdx);
    const body = decoded.slice(separatorIdx + 4);

    expect(headers).toContain('To: friend@gmail.comCc: leak@evil.test');
    expect(headers).not.toContain('\nCc: leak@evil.test');
    expect(headers).not.toContain('\nBcc: attacker@evil.test');
    expect(headers).not.toContain('\nX-Injected:');
    expect(headers).toContain('Subject: =?UTF-8?B?');
    expect(headers).toContain('MIME-Version: 1.0');
    expect(headers).toContain('Content-Type: multipart/alternative; boundary=');
    expect(body).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(body).toContain('Plain body');
    expect(body).toContain('Content-Type: text/html; charset="UTF-8"');
    expect(body).toContain('<p>HTML body</p>');
  });
});

describe('EmailService Gmail HTTPS API', () => {
  const originalEnv: Partial<Record<string, string>> = {};
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    for (const key of EMAIL_ENV_KEYS) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of EMAIL_ENV_KEYS) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('detects Gmail API configuration only when all three OAuth vars are present', () => {
    const svc = new EmailService();
    expect(svc.isConfigured()).toBe(false);

    process.env.GMAIL_CLIENT_ID = 'cid';
    process.env.GMAIL_CLIENT_SECRET = 'csec';
    expect(svc.isConfigured()).toBe(false);

    process.env.GMAIL_REFRESH_TOKEN = 'rtok';
    expect(svc.isConfigured()).toBe(true);
  });

  it('exchanges OAuth refresh token and sends via Gmail REST API over HTTPS', async () => {
    process.env.GMAIL_CLIENT_ID = 'client-123';
    process.env.GMAIL_CLIENT_SECRET = 'secret-456';
    process.env.GMAIL_REFRESH_TOKEN = 'refresh-789';
    process.env.GMAIL_SENDER_EMAIL = 'hr@gmail.com';
    process.env.EMAIL_DEMO_OVERRIDE = 'owner@gmail.com';

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'ya29.test-token' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'gmail-msg-1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    globalThis.fetch = fetchMock as typeof fetch;

    const svc = new EmailService();
    const outcome = await svc.sendEmail({
      to: 'friend@gmail.com',
      subject: 'Meeting Invitation',
      html: '<p>Hello</p>',
      text: 'Hello',
    });

    expect(outcome).toEqual({
      delivered: true,
      mode: 'GMAIL_API',
      recipientEmail: 'friend@gmail.com',
      routedTo: 'friend@gmail.com',
      providerId: 'gmail-msg-1',
      note: undefined,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://oauth2.googleapis.com/token',
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    );
    const sendInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(sendInit.headers).toMatchObject({
      Authorization: 'Bearer ya29.test-token',
    });
  });

  it('falls back to Resend HTTPS API when Gmail API fails and RESEND_API_KEY is configured', async () => {
    process.env.GMAIL_CLIENT_ID = 'client-123';
    process.env.GMAIL_CLIENT_SECRET = 'secret-456';
    process.env.GMAIL_REFRESH_TOKEN = 'bad-refresh';
    process.env.RESEND_API_KEY = 're_test_key';

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'invalid_grant' }), {
          status: 400,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'resend-id-1' }), {
          status: 200,
        }),
      );
    globalThis.fetch = fetchMock as typeof fetch;

    const svc = new EmailService();
    const outcome = await svc.sendEmail({
      to: 'owner@gmail.com',
      subject: 'Fallback Test',
      html: '<p>Hi</p>',
      text: 'Hi',
    });

    expect(outcome).toMatchObject({
      delivered: true,
      mode: 'RESEND_API',
      providerId: 'resend-id-1',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://api.resend.com/emails');
  });

  it('returns delivered: false with note when Gmail API fails and no fallback exists', async () => {
    process.env.GMAIL_CLIENT_ID = 'client-123';
    process.env.GMAIL_CLIENT_SECRET = 'secret-456';
    process.env.GMAIL_REFRESH_TOKEN = 'bad-refresh';

    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: 'invalid_grant',
          error_description: 'Token has been expired or revoked.',
        }),
        { status: 400 },
      ),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    const svc = new EmailService();
    const outcome = await svc.sendEmail({
      to: 'friend@gmail.com',
      subject: 'Fail Test',
      html: '<p>Hi</p>',
      text: 'Hi',
    });

    expect(outcome.delivered).toBe(false);
    expect(outcome.mode).toBe('GMAIL_API');
    expect(outcome.note).toContain('Token has been expired or revoked');
  });
});
