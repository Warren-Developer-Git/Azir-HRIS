import { IsIn, IsOptional, IsString } from 'class-validator';
import { HolidayType } from '@prisma/client';

export class UpdateHolidayDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(['REGULAR', 'SPECIAL'])
  type?: HolidayType;
}
