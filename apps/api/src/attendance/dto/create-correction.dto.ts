import {
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { CorrectionType, WorkLocationType } from '@prisma/client';

export class CreateCorrectionDto {
  @IsISO8601()
  @IsNotEmpty()
  date!: string; // YYYY-MM-DD

  @IsEnum(CorrectionType)
  @IsNotEmpty()
  type!: CorrectionType;

  @IsISO8601()
  @IsOptional()
  proposedTimeIn?: string;

  @IsISO8601()
  @IsOptional()
  proposedTimeOut?: string;

  @IsEnum(WorkLocationType)
  @IsOptional()
  locationType?: WorkLocationType;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  destination?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
