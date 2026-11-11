import { IsDateString, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { normalizeDateInput } from './create-leave-request.dto.js';

export class UpdateLeaveRequestDto {
  @Transform(({ value }) => normalizeDateInput(value))
  @IsDateString({}, { message: 'startDate must be a valid date string (YYYY-MM-DD)' })
  @IsOptional()
  startDate?: string;

  @Transform(({ value }) => normalizeDateInput(value))
  @IsDateString({}, { message: 'endDate must be a valid date string (YYYY-MM-DD)' })
  @IsOptional()
  endDate?: string;

  @IsString({ message: 'reason must be a string' })
  @IsOptional()
  reason?: string;
}
