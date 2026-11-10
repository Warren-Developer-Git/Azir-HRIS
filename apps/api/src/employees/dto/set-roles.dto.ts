import { IsArray, IsEnum } from 'class-validator';
import { Role } from '@prisma/client';

export class SetRolesDto {
  @IsArray()
  @IsEnum(Role, { each: true })
  roles!: Role[];
}
