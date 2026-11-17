import { IsDateString, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { PayrollPeriodType } from '@prisma/client';

export class CreatePeriodDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsEnum(PayrollPeriodType)
  @IsOptional()
  cutoffType?: PayrollPeriodType;

  @IsDateString()
  @IsNotEmpty()
  startDate!: string;

  @IsDateString()
  @IsNotEmpty()
  endDate!: string;

  @IsDateString()
  @IsNotEmpty()
  payDate!: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  workingDays?: number;
}
