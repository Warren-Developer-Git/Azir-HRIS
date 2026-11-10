import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class DecideLeaveRequestDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  comment?: string;
}
