import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { CountingMode, Gender, LeaveKind, MaritalStatus } from '@prisma/client';

export class UpdateLeaveTypeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(['YEARLY', 'PER_EVENT'])
  kind?: LeaveKind;

  @IsOptional()
  @IsInt()
  @Min(0)
  defaultDays?: number;

  @IsOptional()
  @IsIn(['WORKING_DAYS', 'CALENDAR_DAYS'])
  countingMode?: CountingMode;

  @IsOptional()
  @IsIn(['MALE', 'FEMALE'])
  eligibleGender?: Gender | null;

  @IsOptional()
  @IsIn(['SINGLE', 'MARRIED', 'WIDOWED', 'DIVORCED'])
  eligibleMaritalStatus?: MaritalStatus | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  minServiceMonths?: number;
}
