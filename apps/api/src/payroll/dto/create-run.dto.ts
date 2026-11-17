import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateRunDto {
  @IsUUID()
  @IsNotEmpty()
  payrollPeriodId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  runNumber!: string;
}
