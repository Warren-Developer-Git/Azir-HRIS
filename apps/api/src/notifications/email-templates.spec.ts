import { afterEach, describe, expect, it, vi } from 'vitest';
import nodemailer from 'nodemailer';
import { BadRequestException } from '@nestjs/common';
import {
  detectMeetingPlatform,
  resolveEmailContent,
  validateMeetingUrl,
} from './email-templates.js';
import { EmailService } from './email.service.js';

describe('Email Templates & Validation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses dedicated default subject and body when left empty', () => {
    const docEmail = resolveEmailContent({
      preset: 'DOCUMENT_NOTICE',
      recipientFirstName: 'Gabriela',
      recipientFullName: 'Gabriela Silang',
      senderName: 'Maria Clara',
      senderRoleLabel: 'HR',
      tenantName: 'Azir Company Global Tech',
    });

    expect(docEmail.subject).toContain('HR Document Update');
    expect(docEmail.body).toContain('Hi Gabriela');
    expect(docEmail.body).toContain('Documents portal');
  });

  it('auto-detects Google Meet / Zoom and applies default meeting invite body when message is blank', () => {
    expect(detectMeetingPlatform('https://meet.google.com/abc-defg-hij')).toBe(
      'Google Meet',
    );
    expect(detectMeetingPlatform('https://us05web.zoom.us/j/123456')).toBe(
      'Zoom Meeting',
    );

    const invite = resolveEmailContent({
      recipientFirstName: 'Jose',
      recipientFullName: 'Jose Rizal',
      senderName: 'Manuel Quezon',
      senderRoleLabel: 'Manager',
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
      meetingAt: 'Nov 16, 2026 at 2:00 PM',
    });

    expect(invite.preset).toBe('MEETING_INVITE');
    expect(invite.meetingPlatform).toBe('Google Meet');
    expect(invite.body).toContain('invited you to a Google Meet');
    expect(invite.body).toContain('Nov 16, 2026 at 2:00 PM');
    expect(invite.html).toContain('Join Google Meet');
  });

  it('rejects non-https meeting URLs and escapes HTML injection in message body', () => {
    expect(() => validateMeetingUrl('http://zoom.us/j/123')).toThrow(
      BadRequestException,
    );
    expect(() => validateMeetingUrl('javascript:alert(1)')).toThrow(
      BadRequestException,
    );

    const escaped = resolveEmailContent({
      recipientFirstName: 'Gabriela',
      recipientFullName: 'Gabriela Silang',
      senderName: 'Maria Clara',
      senderRoleLabel: 'HR',
      message: '<script>alert("xss")</script> Hello',
    });

    expect(escaped.html).not.toContain('<script>');
    expect(escaped.html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });

  it('routes synthetic .test demo emails to EMAIL_DEMO_OVERRIDE when configured', () => {
    const prev = process.env.EMAIL_DEMO_OVERRIDE;
    process.env.EMAIL_DEMO_OVERRIDE = 'capstone.demo@gmail.com';
    try {
      const svc = new EmailService();
      const res = svc.resolveTargetEmail('employee@acgt.test');
      expect(res.targetEmail).toBe('capstone.demo@gmail.com');
      expect(res.routedOverrideNote).toContain('employee@acgt.test');
    } finally {
      if (prev === undefined) {
        delete process.env.EMAIL_DEMO_OVERRIDE;
      } else {
        process.env.EMAIL_DEMO_OVERRIDE = prev;
      }
    }
  });

  it('prefers Gmail SMTP when SMTP_USER and SMTP_PASS are set and falls back to LOG_ONLY when unconfigured', async () => {
    const prevEnv = {
      SMTP_USER: process.env.SMTP_USER,
      SMTP_PASS: process.env.SMTP_PASS,
      RESEND_API_KEY: process.env.RESEND_API_KEY,
    };

    try {
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASS;
      delete process.env.RESEND_API_KEY;

      const svc = new EmailService();
      expect(svc.isConfigured()).toBe(false);
      const logRes = await svc.sendEmail({
        to: 'friend@example.com',
        subject: 'Test',
        html: '<p>Hi</p>',
        text: 'Hi',
      });
      expect(logRes.mode).toBe('LOG_ONLY');
      expect(logRes.delivered).toBe(false);

      process.env.SMTP_USER = 'sender@gmail.com';
      process.env.SMTP_PASS = 'abcd efgh ijkl mnop';
      process.env.RESEND_API_KEY = 're_dummy_key';
      expect(svc.isConfigured()).toBe(true);

      const sendMailMock = vi.fn().mockResolvedValue({ messageId: '<msg-1@gmail.com>' });
      const transportSpy = vi
        .spyOn(nodemailer, 'createTransport')
        .mockReturnValue({ sendMail: sendMailMock } as any);

      const smtpRes = await svc.sendEmail({
        to: 'friend@example.com',
        subject: 'Hello Friend',
        html: '<p>Hello</p>',
        text: 'Hello',
      });

      expect(transportSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'smtp.gmail.com',
          port: 587,
          auth: { user: 'sender@gmail.com', pass: 'abcdefghijklmnop' },
        }),
      );
      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'friend@example.com',
          subject: 'Hello Friend',
        }),
      );
      expect(smtpRes.delivered).toBe(true);
      expect(smtpRes.mode).toBe('GMAIL_SMTP');
      expect(smtpRes.providerId).toBe('<msg-1@gmail.com>');

      transportSpy.mockRestore();
    } finally {
      for (const [k, v] of Object.entries(prevEnv)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });

  it('ignores Resend onboarding sender when dispatching Gmail SMTP and surfaces SMTP errors cleanly', async () => {
    const prevEnv = {
      SMTP_USER: process.env.SMTP_USER,
      SMTP_PASS: process.env.SMTP_PASS,
      EMAIL_FROM: process.env.EMAIL_FROM,
      RESEND_API_KEY: process.env.RESEND_API_KEY,
    };

    try {
      process.env.SMTP_USER = 'sender@gmail.com';
      process.env.SMTP_PASS = 'abcdefghijklmnop';
      process.env.EMAIL_FROM = 'HRIS <onboarding@resend.dev>';
      delete process.env.RESEND_API_KEY;

      const sendMailOk = vi.fn().mockResolvedValue({ messageId: '<smtp-ok@gmail.com>' });
      vi.spyOn(nodemailer, 'createTransport').mockReturnValueOnce({
        sendMail: sendMailOk,
      } as any);

      const svc = new EmailService();
      const okRes = await svc.sendEmail({
        to: 'friend@example.com',
        subject: 'Notice',
        html: '<p>Notice</p>',
        text: 'Notice',
      });

      expect(okRes.delivered).toBe(true);
      expect(sendMailOk).toHaveBeenCalledWith(
        expect.objectContaining({
          from: '"Azir Company Global Tech HRIS" <sender@gmail.com>',
        }),
      );

      const sendMailFail = vi.fn().mockRejectedValue(new Error('535 Invalid login'));
      vi.spyOn(nodemailer, 'createTransport').mockReturnValueOnce({
        sendMail: sendMailFail,
      } as any);

      const failRes = await svc.sendEmail({
        to: 'friend@example.com',
        subject: 'Notice',
        html: '<p>Notice</p>',
        text: 'Notice',
      });

      expect(failRes.delivered).toBe(false);
      expect(failRes.mode).toBe('GMAIL_SMTP');
      expect(failRes.note).toBe('535 Invalid login');
    } finally {
      for (const [k, v] of Object.entries(prevEnv)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });

  it('extracts Resend HTTP 403 JSON error message into outcome.note without throwing', async () => {
    const prevEnv = {
      SMTP_USER: process.env.SMTP_USER,
      SMTP_PASS: process.env.SMTP_PASS,
      RESEND_API_KEY: process.env.RESEND_API_KEY,
    };

    try {
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASS;
      process.env.RESEND_API_KEY = 're_test_key';

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              statusCode: 403,
              message: 'You can only send testing emails to your own email address',
            }),
            { status: 403, headers: { 'Content-Type': 'application/json' } },
          ),
        ),
      );

      const svc = new EmailService();
      const res = await svc.sendEmail({
        to: 'friend@example.com',
        subject: 'Meeting',
        html: '<p>Hi</p>',
        text: 'Hi',
      });

      expect(res.delivered).toBe(false);
      expect(res.mode).toBe('RESEND_API');
      expect(res.note).toBe(
        'Resend HTTP 403: You can only send testing emails to your own email address',
      );
    } finally {
      for (const [k, v] of Object.entries(prevEnv)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
});
