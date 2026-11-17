import { BadRequestException } from '@nestjs/common';
import type { EmailPreset } from './dto/send-email.dto.js';

export interface ComposeEmailInput {
  preset?: EmailPreset;
  subject?: string;
  message?: string;
  meetingUrl?: string;
  meetingAt?: string;
  recipientFirstName: string;
  recipientFullName: string;
  senderName: string;
  senderRoleLabel: string;
  tenantName?: string;
  portalUrl?: string;
  routedDemoRecipientNote?: string;
}

export interface ComposedEmailResult {
  preset: EmailPreset;
  subject: string;
  body: string;
  meetingUrl: string | null;
  meetingAt: string | null;
  meetingPlatform: string | null;
  html: string;
  text: string;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function detectMeetingPlatform(meetingUrl: string): string {
  const lower = meetingUrl.toLowerCase();
  if (lower.includes('meet.google.com')) return 'Google Meet';
  if (lower.includes('zoom.us')) return 'Zoom Meeting';
  if (lower.includes('teams.microsoft.com') || lower.includes('teams.live.com')) {
    return 'Microsoft Teams';
  }
  return 'Online Meeting';
}

export function validateMeetingUrl(rawUrl?: string): string | null {
  const trimmed = rawUrl?.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new BadRequestException('meetingUrl must be a valid https:// URL');
  }

  if (parsed.protocol !== 'https:') {
    throw new BadRequestException('meetingUrl must start with https://');
  }

  return parsed.toString();
}

export function resolveEmailContent(
  input: ComposeEmailInput,
): ComposedEmailResult {
  const validatedUrl = validateMeetingUrl(input.meetingUrl);
  const meetingAt = input.meetingAt?.trim() || null;
  const meetingPlatform = validatedUrl
    ? detectMeetingPlatform(validatedUrl)
    : null;

  const effectivePreset: EmailPreset =
    input.preset ?? (validatedUrl ? 'MEETING_INVITE' : 'GENERAL_NOTICE');

  const customSubject = input.subject?.trim();
  const customMessage = input.message?.trim();

  const defaultSubjects: Record<EmailPreset, string> = {
    MEETING_INVITE: meetingPlatform
      ? `Meeting Invitation (${meetingPlatform}): HR / Team Sync`
      : 'Meeting Invitation: HR / Team Sync',
    DOCUMENT_NOTICE: 'HR Document Update: Action / Pickup Notice',
    ATTENDANCE_NOTICE: 'Attendance & Daily Time Record (DTR) Notice',
    GENERAL_NOTICE: `HRIS Notice from ${input.senderName} (${input.senderRoleLabel})`,
  };

  const whenClause = meetingAt ? ` scheduled for ${meetingAt}` : '';

  const defaultBodies: Record<EmailPreset, string> = {
    MEETING_INVITE: validatedUrl
      ? `Hi ${input.recipientFirstName}, ${input.senderName} (${input.senderRoleLabel}) has invited you to a ${meetingPlatform}${whenClause}. Please join using the meeting link provided below.`
      : `Hi ${input.recipientFirstName}, ${input.senderName} (${input.senderRoleLabel}) is requesting a sync meeting with you${whenClause}. Please check the HRIS portal for schedule details.`,
    DOCUMENT_NOTICE: `Hi ${input.recipientFirstName}, this is an update regarding your requested HR document. Please log in to the Documents portal in the HRIS for status, pickup, or download details.`,
    ATTENDANCE_NOTICE: `Hi ${input.recipientFirstName}, please review your Daily Time Record (DTR) in the HRIS portal and file any pending Official Business (OB) or Missed Punch requests if needed.`,
    GENERAL_NOTICE: `Hi ${input.recipientFirstName}, you have received a new notice from ${input.senderName} (${input.senderRoleLabel}). Please log in to the HRIS portal for full details.`,
  };

  // If sender typed nothing in body but pasted a meeting link, default cleanly to meeting invite wording
  const fallbackBody =
    validatedUrl && !customMessage && effectivePreset === 'GENERAL_NOTICE'
      ? defaultBodies.MEETING_INVITE
      : defaultBodies[effectivePreset];

  const subject = customSubject || defaultSubjects[effectivePreset];
  const body = customMessage || fallbackBody;

  const company = input.tenantName?.trim() || 'HRIS Portal';
  const portalUrl = input.portalUrl || 'http://localhost:3000/dashboard';

  const textLines = [
    `${company}`,
    '',
    ...(input.routedDemoRecipientNote ? [input.routedDemoRecipientNote, ''] : []),
    subject,
    '',
    body,
  ];
  if (validatedUrl) {
    textLines.push(
      '',
      `${meetingPlatform ?? 'Online Meeting'}${meetingAt ? ` (${meetingAt})` : ''}: ${validatedUrl}`,
    );
  }
  textLines.push(
    '',
    `Open HRIS Portal: ${portalUrl}`,
    '',
    `Sent by ${input.senderName} (${input.senderRoleLabel})`,
  );

  const html = buildCorporateEmailHtml({
    company,
    subject,
    body,
    senderName: input.senderName,
    senderRoleLabel: input.senderRoleLabel,
    meetingUrl: validatedUrl,
    meetingAt,
    meetingPlatform,
    portalUrl,
    routedDemoRecipientNote: input.routedDemoRecipientNote,
  });

  return {
    preset: effectivePreset,
    subject,
    body,
    meetingUrl: validatedUrl,
    meetingAt,
    meetingPlatform,
    html,
    text: textLines.join('\n'),
  };
}

export function buildCorporateEmailHtml(params: {
  company: string;
  subject: string;
  body: string;
  senderName: string;
  senderRoleLabel: string;
  meetingUrl?: string | null;
  meetingAt?: string | null;
  meetingPlatform?: string | null;
  portalUrl: string;
  routedDemoRecipientNote?: string;
}): string {
  const safeBodyHtml = escapeHtml(params.body).replaceAll('\n', '<br />');
  const meetingSection = params.meetingUrl
    ? `
      <div style="margin:20px 0;padding:16px;border:1px solid #e5e5e5;border-radius:8px;background:#fafafa;">
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#525252;">
          ${escapeHtml(params.meetingPlatform || 'Online Meeting')}${params.meetingAt ? ` &bull; ${escapeHtml(params.meetingAt)}` : ''}
        </div>
        <div style="margin-top:10px;">
          <a href="${escapeHtml(params.meetingUrl)}" style="display:inline-block;padding:10px 16px;background:#171717;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;border-radius:6px;">
            Join ${escapeHtml(params.meetingPlatform || 'Meeting')}
          </a>
        </div>
        <div style="margin-top:8px;font-size:12px;color:#525252;word-break:break-all;">
          ${escapeHtml(params.meetingUrl)}
        </div>
      </div>`
    : '';

  const demoBanner = params.routedDemoRecipientNote
    ? `<div style="margin-bottom:14px;padding:8px 12px;background:#f5f5f5;border-left:3px solid #171717;font-size:12px;color:#404040;">${escapeHtml(params.routedDemoRecipientNote)}</div>`
    : '';

  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:24px;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#171717;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e5e5;border-radius:10px;overflow:hidden;">
      <div style="padding:18px 24px;background:#171717;color:#ffffff;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;opacity:0.75;">${escapeHtml(params.company)}</div>
        <div style="font-size:17px;font-weight:700;margin-top:4px;">${escapeHtml(params.subject)}</div>
      </div>
      <div style="padding:24px;font-size:14px;line-height:1.6;color:#262626;">
        ${demoBanner}
        <p style="margin:0 0 16px 0;">${safeBodyHtml}</p>
        ${meetingSection}
        <div style="margin-top:20px;">
          <a href="${escapeHtml(params.portalUrl)}" style="display:inline-block;padding:9px 14px;border:1px solid #d4d4d4;color:#171717;text-decoration:none;font-size:13px;font-weight:600;border-radius:6px;">
            Open HRIS Portal
          </a>
        </div>
      </div>
      <div style="padding:14px 24px;background:#fafafa;border-top:1px solid #e5e5e5;font-size:11px;color:#737373;">
        Sent by ${escapeHtml(params.senderName)} (${escapeHtml(params.senderRoleLabel)}). For privacy protection, sensitive payroll figures and medical records remain accessible only inside the authenticated HRIS portal.
      </div>
    </div>
  </body>
</html>`;
}
