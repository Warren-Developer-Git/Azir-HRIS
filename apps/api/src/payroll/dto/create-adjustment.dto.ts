import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { AdjustmentType } from '@prisma/client';
import { Type } from 'class-transformer';

export class CreateAdjustmentDto {
  @IsUUID()
  @IsNotEmpty()
  employeeId!: string;

  @IsEnum(AdjustmentType)
  @IsNotEmpty()
  type!: AdjustmentType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  description!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  amount?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  quantity?: number;
}
