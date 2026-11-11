import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsArray,
  IsDateString,
} from 'class-validator';
import { Transform } from 'class-transformer';
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
  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value))
  @IsUUID('all', { message: 'departmentId must be a valid UUID' })
  departmentId?: string;

  @IsString()
  @IsNotEmpty()
  position!: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value))
  @IsUUID('all', { message: 'managerId must be a valid UUID' })
  managerId?: string;

  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    if (trimmed.includes('T')) return trimmed.split('T')[0];
    if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(trimmed)) {
      const [y, m, d] = trimmed.split('/');
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
      const [m, d, y] = trimmed.split('/');
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    return trimmed;
  })
  @IsDateString({}, { message: 'hireDate must be a valid date string (YYYY-MM-DD)' })
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
