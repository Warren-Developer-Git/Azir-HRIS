import { IsNotEmpty, IsString, IsUUID, IsOptional, MaxLength, MinLength } from 'class-validator';

export class CreateDocumentRequestDto {
  @IsUUID()
  @IsNotEmpty()
  documentTypeId!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(3, { message: 'Purpose must be at least 3 characters' })
  @MaxLength(500, { message: 'Purpose cannot exceed 500 characters' })
  purpose!: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  payPeriod?: string;
}
