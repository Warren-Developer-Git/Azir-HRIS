import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { WorkLocationType } from '@prisma/client';

export class PunchDto {
  @IsEnum(WorkLocationType)
  @IsOptional()
  locationType?: WorkLocationType;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  notes?: string;
}
