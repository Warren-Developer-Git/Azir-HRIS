import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsArray,
} from 'class-validator';
import { Gender, MaritalStatus, Role } from '@prisma/client';

export class CreateEmployeeDto {
  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  employeeNo!: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsString()
  @IsNotEmpty()
  position!: string;

  @IsOptional()
  @IsUUID()
  managerId?: string;

  @IsString()
  @IsNotEmpty()
  hireDate!: string;

  @IsIn(['MALE', 'FEMALE'])
  gender!: Gender;

  @IsIn(['SINGLE', 'MARRIED', 'WIDOWED', 'DIVORCED'])
  maritalStatus!: MaritalStatus;

  @IsOptional()
  @IsArray()
  roles?: Role[];
}
