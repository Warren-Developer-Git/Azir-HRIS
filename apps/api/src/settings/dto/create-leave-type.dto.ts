import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { CountingMode, Gender, LeaveKind, MaritalStatus } from '@prisma/client';

export class CreateLeaveTypeDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsIn(['YEARLY', 'PER_EVENT'])
  kind!: LeaveKind;

  @IsInt()
  @Min(0)
  defaultDays!: number;

  @IsIn(['WORKING_DAYS', 'CALENDAR_DAYS'])
  countingMode!: CountingMode;

  @IsOptional()
  @IsIn(['MALE', 'FEMALE'])
  eligibleGender?: Gender;

  @IsOptional()
  @IsIn(['SINGLE', 'MARRIED', 'WIDOWED', 'SEPARATED'])
  eligibleMaritalStatus?: MaritalStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  minServiceMonths?: number;
}
