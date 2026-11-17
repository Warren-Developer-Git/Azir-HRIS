import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class DecideRunDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['APPROVE', 'REJECT'])
  action!: 'APPROVE' | 'REJECT';

  @IsString()
  @IsOptional()
  @MaxLength(500)
  rejectReason?: string;
}
