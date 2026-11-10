import { IsDateString, IsOptional, IsString } from 'class-validator';

export class UpdateLeaveRequestDto {
  @IsDateString({}, { message: 'startDate must be a valid date string (YYYY-MM-DD)' })
  @IsOptional()
  startDate?: string;

  @IsDateString({}, { message: 'endDate must be a valid date string (YYYY-MM-DD)' })
  @IsOptional()
  endDate?: string;

  @IsString({ message: 'reason must be a string' })
  @IsOptional()
  reason?: string;
}
