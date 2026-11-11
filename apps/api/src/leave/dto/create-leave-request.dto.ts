import { IsDateString, IsNotEmpty, IsString, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';

export function normalizeDateInput(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (trimmed.includes('T')) return trimmed.split('T')[0];
  if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('/');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
    const [m, d, y] = trimmed.split('/');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return trimmed;
}

export class CreateLeaveRequestDto {
  @IsUUID('all', { message: 'leaveTypeId must be a valid UUID' })
  @IsNotEmpty({ message: 'leaveTypeId is required' })
  leaveTypeId!: string;

  @Transform(({ value }) => normalizeDateInput(value))
  @IsDateString({}, { message: 'startDate must be a valid date string (YYYY-MM-DD)' })
  @IsNotEmpty({ message: 'startDate is required' })
  startDate!: string;

  @Transform(({ value }) => normalizeDateInput(value))
  @IsDateString({}, { message: 'endDate must be a valid date string (YYYY-MM-DD)' })
  @IsNotEmpty({ message: 'endDate is required' })
  endDate!: string;

  @IsString({ message: 'reason must be a string' })
  @IsNotEmpty({ message: 'reason is required' })
  reason!: string;
}
