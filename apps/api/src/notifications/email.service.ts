import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';

export interface SendRawEmailInput {
  to: string;
  recipientLabel?: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailSendOutcome {
  delivered: boolean;
  mode: 'GMAIL_API' | 'GMAIL_SMTP' | 'RESEND_API' | 'LOG_ONLY';
  recipientEmail: string;
  routedTo: string;
  providerId?: string;
  note?: string;
}

export interface BuildGmailRawMessageInput {
  from?: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}

function sanitizeEmailHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, '').trim();
}

/**
 * Builds an RFC 2822 multipart/alternative MIME message encoded as base64url
 * for the Gmail REST API (`messages.send`).
 */
export function buildGmailRawMessage(input: BuildGmailRawMessageInput): string {
  const boundary = `----=_AzirHRIS_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const cleanTo = sanitizeEmailHeaderValue(input.to);
  const cleanSubject = sanitizeEmailHeaderValue(input.subject);
  const encodedSubject = `=?UTF-8?B?${Buffer.from(cleanSubject, 'utf8').toString('base64')}?=`;

  const headers: string[] = [];
  if (input.from) {
    const cleanFrom = sanitizeEmailHeaderValue(input.from);
    if (cleanFrom) {
      headers.push(`From: ${cleanFrom}`);
    }
  }
  headers.push(`To: ${cleanTo}`);
  headers.push(`Subject: ${encodedSubject}`);
  headers.push('MIME-Version: 1.0');
  headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);

  const mime = [
    headers.join('\r\n'),
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    input.text,
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    input.html,
    `--${boundary}--`,
  ].join('\r\n');

  return Buffer.from(mime, 'utf8').toString('base64url');
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resendEndpoint = 'https://api.resend.com/emails';
  private readonly googleTokenEndpoint = 'https://oauth2.googleapis.com/token';
  private readonly gmailSendEndpoint =
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

  private getGmailApiConfig() {
    const clientId = process.env.GMAIL_CLIENT_ID?.trim();
    const clientSecret = process.env.GMAIL_CLIENT_SECRET?.trim();
    const refreshToken = process.env.GMAIL_REFRESH_TOKEN?.trim();
    if (!clientId || !clientSecret || !refreshToken) {
      return null;
    }

    const senderEmail =
      process.env.GMAIL_SENDER_EMAIL?.trim() || process.env.SMTP_USER?.trim();

    return { clientId, clientSecret, refreshToken, senderEmail };
  }

  private getSmtpConfig() {
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS?.replace(/\s+/g, '').trim();
    if (!user || !pass) {
      return null;
    }

    const host = process.env.SMTP_HOST?.trim() || 'smtp.gmail.com';
    const rawPort = Number(process.env.SMTP_PORT?.trim() || '587');
    const port = Number.isFinite(rawPort) && rawPort > 0 ? rawPort : 587;
    return { host, port, secure: port === 465, user, pass };
  }

  /** Returns true when Gmail HTTPS API, Gmail SMTP, or Resend API credentials are configured. */
  isConfigured(): boolean {
    return Boolean(
      this.getGmailApiConfig() ||
        this.getSmtpConfig() ||
        process.env.RESEND_API_KEY?.trim(),
    );
  }

  resolveTargetEmail(intendedEmail: string): {
    targetEmail: string;
    routedOverrideNote?: string;
  } {
    const override = process.env.EMAIL_DEMO_OVERRIDE?.trim();
    if (!override) {
      return { targetEmail: intendedEmail };
    }

    // Redirect synthetic .test / .local demo emails to the configured real Gmail inbox
    const lower = intendedEmail.toLowerCase();
    if (lower.endsWith('.test') || lower.endsWith('.local')) {
      return {
        targetEmail: override,
        routedOverrideNote: `Demo delivery routed from synthetic account (${intendedEmail}) to ${override}`,
      };
    }

    return { targetEmail: intendedEmail };
  }

  async sendEmail(input: SendRawEmailInput): Promise<EmailSendOutcome> {
    const { targetEmail, routedOverrideNote } = this.resolveTargetEmail(input.to);
    const preferredProvider = process.env.EMAIL_PROVIDER?.trim().toLowerCase();
    const gmailApi = this.getGmailApiConfig();
    const smtp = this.getSmtpConfig();
    const apiKey = process.env.RESEND_API_KEY?.trim();

    if (preferredProvider === 'resend' && apiKey) {
      return this.sendViaResend(apiKey, input, targetEmail, routedOverrideNote);
    }

    if (
      (preferredProvider === 'gmail_api' || preferredProvider === 'gmail-api') &&
      gmailApi
    ) {
      const outcome = await this.sendViaGmailApi(
        gmailApi,
        input,
        targetEmail,
        routedOverrideNote,
      );
      if (outcome.delivered || !apiKey) {
        return outcome;
      }
      return this.sendViaResend(apiKey, input, targetEmail, routedOverrideNote);
    }

    if (gmailApi && preferredProvider !== 'smtp') {
      const gmailOutcome = await this.sendViaGmailApi(
        gmailApi,
        input,
        targetEmail,
        routedOverrideNote,
      );
      if (gmailOutcome.delivered || !apiKey) {
        return gmailOutcome;
      }

      this.logger.log(
        `Falling back to Resend HTTPS API for ${targetEmail} after Gmail API failure`,
      );
      return this.sendViaResend(apiKey, input, targetEmail, routedOverrideNote);
    }

    if (smtp) {
      const smtpOutcome = await this.sendViaSmtp(
        smtp,
        input,
        targetEmail,
        routedOverrideNote,
      );
      if (smtpOutcome.delivered || !apiKey) {
        return smtpOutcome;
      }

      this.logger.log(
        `Falling back to Resend HTTPS API for ${targetEmail} after SMTP failure`,
      );
      return this.sendViaResend(apiKey, input, targetEmail, routedOverrideNote);
    }

    if (apiKey) {
      return this.sendViaResend(apiKey, input, targetEmail, routedOverrideNote);
    }

    this.logger.log(
      `[LOG_ONLY] Email queued for ${targetEmail} | Subject: "${input.subject}"`,
    );
    return {
      delivered: false,
      mode: 'LOG_ONLY',
      recipientEmail: input.to,
      routedTo: targetEmail,
      note: 'No Gmail HTTPS API, SMTP_USER/SMTP_PASS, or RESEND_API_KEY configured; recorded in LOG_ONLY mode',
    };
  }

  private async sendViaGmailApi(
    gmailApi: NonNullable<ReturnType<EmailService['getGmailApiConfig']>>,
    input: SendRawEmailInput,
    targetEmail: string,
    routedOverrideNote?: string,
  ): Promise<EmailSendOutcome> {
    try {
      const tokenBody = new URLSearchParams({
        client_id: gmailApi.clientId,
        client_secret: gmailApi.clientSecret,
        refresh_token: gmailApi.refreshToken,
        grant_type: 'refresh_token',
      });

      const tokenRes = await fetch(this.googleTokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenBody.toString(),
        signal: AbortSignal.timeout(8000),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text().catch(() => '');
        const reason = this.extractGoogleErrorMessage(
          errText,
          `Gmail OAuth HTTP ${tokenRes.status}`,
        );
        this.logger.warn(`Failed to refresh Gmail OAuth token: ${reason}`);
        return {
          delivered: false,
          mode: 'GMAIL_API',
          recipientEmail: input.to,
          routedTo: targetEmail,
          note: reason,
        };
      }

      const tokenData = (await tokenRes.json().catch(() => ({}))) as {
        access_token?: string;
      };
      if (!tokenData.access_token) {
        return {
          delivered: false,
          mode: 'GMAIL_API',
          recipientEmail: input.to,
          routedTo: targetEmail,
          note: 'Gmail OAuth response missing access_token',
        };
      }

      const from = this.resolveGmailFromHeader(gmailApi.senderEmail);

      const raw = buildGmailRawMessage({
        from,
        to: targetEmail,
        subject: input.subject,
        text: input.text,
        html: input.html,
      });

      const sendRes = await fetch(this.gmailSendEndpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw }),
        signal: AbortSignal.timeout(8000),
      });

      if (!sendRes.ok) {
        const errText = await sendRes.text().catch(() => '');
        const reason = this.extractGoogleErrorMessage(
          errText,
          `Gmail API HTTP ${sendRes.status}`,
        );
        this.logger.warn(
          `Gmail API send failed for ${targetEmail}: ${reason}`,
        );
        return {
          delivered: false,
          mode: 'GMAIL_API',
          recipientEmail: input.to,
          routedTo: targetEmail,
          note: reason,
        };
      }

      const data = (await sendRes.json().catch(() => ({}))) as { id?: string };
      return {
        delivered: true,
        mode: 'GMAIL_API',
        recipientEmail: input.to,
        routedTo: targetEmail,
        providerId: data.id,
        note: routedOverrideNote,
      };
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'Gmail API network error';
      this.logger.warn(`Failed to send email via Gmail HTTPS API: ${reason}`);
      return {
        delivered: false,
        mode: 'GMAIL_API',
        recipientEmail: input.to,
        routedTo: targetEmail,
        note: reason,
      };
    }
  }

  private extractGoogleErrorMessage(errBody: string, fallback: string): string {
    try {
      const parsed = JSON.parse(errBody) as {
        error_description?: string;
        error?: string | { message?: string };
      };
      if (
        typeof parsed?.error_description === 'string' &&
        parsed.error_description.trim()
      ) {
        return `${fallback}: ${parsed.error_description.trim()}`;
      }
      if (typeof parsed?.error === 'object' && parsed.error?.message) {
        return `${fallback}: ${parsed.error.message.trim()}`;
      }
      if (typeof parsed?.error === 'string' && parsed.error.trim()) {
        return `${fallback}: ${parsed.error.trim()}`;
      }
    } catch {
      // Non-JSON error body
    }
    return fallback;
  }

  private resolveGmailFromHeader(senderEmail?: string): string | undefined {
    const configuredFrom = process.env.EMAIL_FROM?.trim();
    // Ignore Resend's sandbox sender when dispatching through Gmail
    if (configuredFrom && !configuredFrom.includes('onboarding@resend.dev')) {
      return configuredFrom;
    }
    return senderEmail
      ? `"Azir Company Global Tech HRIS" <${senderEmail}>`
      : undefined;
  }

  private async sendViaSmtp(
    smtp: NonNullable<ReturnType<EmailService['getSmtpConfig']>>,
    input: SendRawEmailInput,
    targetEmail: string,
    routedOverrideNote?: string,
  ): Promise<EmailSendOutcome> {
    const from = this.resolveGmailFromHeader(smtp.user)!;

    try {
      const transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: {
          user: smtp.user,
          pass: smtp.pass,
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
      });

      const info = await transporter.sendMail({
        from,
        to: targetEmail,
        subject: input.subject,
        html: input.html,
        text: input.text,
      });

      return {
        delivered: true,
        mode: 'GMAIL_SMTP',
        recipientEmail: input.to,
        routedTo: targetEmail,
        providerId: info.messageId,
        note: routedOverrideNote,
      };
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'SMTP delivery failed';
      this.logger.warn(
        `Failed to send email via Gmail SMTP (${smtp.host}:${smtp.port}) to ${targetEmail}: ${reason}`,
      );
      return {
        delivered: false,
        mode: 'GMAIL_SMTP',
        recipientEmail: input.to,
        routedTo: targetEmail,
        note: reason,
      };
    }
  }

  private async sendViaResend(
    apiKey: string,
    input: SendRawEmailInput,
    targetEmail: string,
    routedOverrideNote?: string,
  ): Promise<EmailSendOutcome> {
    const from =
      process.env.EMAIL_FROM?.trim() ||
      'Azir Company Global Tech HRIS <onboarding@resend.dev>';

    try {
      const response = await fetch(this.resendEndpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [targetEmail],
          subject: input.subject,
          html: input.html,
          text: input.text,
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        let parsedMsg = '';
        try {
          const parsed = JSON.parse(errBody) as { message?: string };
          if (typeof parsed?.message === 'string' && parsed.message.trim()) {
            parsedMsg = parsed.message.trim();
          }
        } catch {
          // Non-JSON error body; keep raw status
        }
        this.logger.warn(
          `Resend API returned HTTP ${response.status} for ${targetEmail}: ${errBody}`,
        );
        return {
          delivered: false,
          mode: 'RESEND_API',
          recipientEmail: input.to,
          routedTo: targetEmail,
          note: parsedMsg
            ? `Resend HTTP ${response.status}: ${parsedMsg}`
            : `Resend HTTP ${response.status}`,
        };
      }

      const data = (await response.json().catch(() => ({}))) as { id?: string };
      return {
        delivered: true,
        mode: 'RESEND_API',
        recipientEmail: input.to,
        routedTo: targetEmail,
        providerId: data.id,
        note: routedOverrideNote,
      };
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'Network error';
      this.logger.warn(`Failed to send email via Resend API: ${reason}`);
      return {
        delivered: false,
        mode: 'RESEND_API',
        recipientEmail: input.to,
        routedTo: targetEmail,
        note: reason,
      };
    }
  }
}
