import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export const EMAIL_PRESETS = [
  'GENERAL_NOTICE',
  'MEETING_INVITE',
  'DOCUMENT_NOTICE',
  'ATTENDANCE_NOTICE',
] as const;

export type EmailPreset = (typeof EMAIL_PRESETS)[number];

export class SendEmailDto {
  @IsUUID()
  recipientEmployeeId!: string;

  @IsOptional()
  @IsIn(EMAIL_PRESETS)
  preset?: EmailPreset;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  meetingUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  meetingAt?: string;
}
