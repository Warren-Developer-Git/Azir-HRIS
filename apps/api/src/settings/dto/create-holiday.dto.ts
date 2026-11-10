import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import { HolidayType } from '@prisma/client';

export class CreateHolidayDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  date!: string;

  @IsIn(['REGULAR', 'SPECIAL'])
  type!: HolidayType;
}
