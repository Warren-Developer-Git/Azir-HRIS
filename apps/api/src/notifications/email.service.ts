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
  mode: 'GMAIL_SMTP' | 'RESEND_API' | 'LOG_ONLY';
  recipientEmail: string;
  routedTo: string;
  providerId?: string;
  note?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resendEndpoint = 'https://api.resend.com/emails';

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

  /** Returns true when either Gmail SMTP or Resend API credentials are configured. */
  isConfigured(): boolean {
    return Boolean(this.getSmtpConfig() || process.env.RESEND_API_KEY?.trim());
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
    const smtp = this.getSmtpConfig();
    const apiKey = process.env.RESEND_API_KEY?.trim();

    if (preferredProvider === 'resend' && apiKey) {
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
      note: 'No SMTP_USER/SMTP_PASS or RESEND_API_KEY configured; recorded in LOG_ONLY mode',
    };
  }

  private async sendViaSmtp(
    smtp: NonNullable<ReturnType<EmailService['getSmtpConfig']>>,
    input: SendRawEmailInput,
    targetEmail: string,
    routedOverrideNote?: string,
  ): Promise<EmailSendOutcome> {
    const configuredFrom = process.env.EMAIL_FROM?.trim();
    // Ignore Resend's sandbox sender when dispatching through Gmail SMTP
    const from =
      configuredFrom && !configuredFrom.includes('onboarding@resend.dev')
        ? configuredFrom
        : `"Azir Company Global Tech HRIS" <${smtp.user}>`;

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
