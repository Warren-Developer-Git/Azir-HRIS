import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class DecideDocumentRequestDto {
  @IsIn(['APPROVED', 'REJECTED'])
  @IsNotEmpty()
  decision!: 'APPROVED' | 'REJECTED';

  @IsString()
  @IsOptional()
  @MaxLength(500)
  comment?: string;
}
