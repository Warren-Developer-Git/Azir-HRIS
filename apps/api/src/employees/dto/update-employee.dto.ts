import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { Gender, MaritalStatus } from '@prisma/client';

export class UpdateEmployeeDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string | null;

  @IsOptional()
  @IsString()
  position?: string;

  @IsOptional()
  @IsUUID()
  managerId?: string | null;

  @IsOptional()
  @IsString()
  hireDate?: string;

  @IsOptional()
  @IsIn(['MALE', 'FEMALE'])
  gender?: Gender;

  @IsOptional()
  @IsIn(['SINGLE', 'MARRIED', 'WIDOWED', 'SEPARATED'])
  maritalStatus?: MaritalStatus;

  @IsOptional()
  @IsString()
  phone?: string | null;

  @IsOptional()
  @IsString()
  address?: string | null;
}
