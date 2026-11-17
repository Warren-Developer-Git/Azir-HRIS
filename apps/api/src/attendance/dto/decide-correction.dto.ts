import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class DecideCorrectionDto {
  @IsIn(['APPROVE', 'REJECT'])
  @IsNotEmpty()
  decision!: 'APPROVE' | 'REJECT';

  @IsString()
  @IsOptional()
  @MaxLength(255)
  comment?: string;
}
