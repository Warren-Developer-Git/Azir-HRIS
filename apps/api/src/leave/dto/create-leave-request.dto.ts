import { IsDateString, IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class CreateLeaveRequestDto {
  @IsUUID('all', { message: 'leaveTypeId must be a valid UUID' })
  @IsNotEmpty({ message: 'leaveTypeId is required' })
  leaveTypeId!: string;

  @IsDateString({}, { message: 'startDate must be a valid date string (YYYY-MM-DD)' })
  @IsNotEmpty({ message: 'startDate is required' })
  startDate!: string;

  @IsDateString({}, { message: 'endDate must be a valid date string (YYYY-MM-DD)' })
  @IsNotEmpty({ message: 'endDate is required' })
  endDate!: string;

  @IsString({ message: 'reason must be a string' })
  @IsNotEmpty({ message: 'reason is required' })
  reason!: string;
}
