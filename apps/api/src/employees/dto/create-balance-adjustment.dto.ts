import { IsInt, IsNotEmpty, IsString, IsUUID, Max, Min, NotEquals } from 'class-validator';

export class CreateBalanceAdjustmentDto {
  @IsUUID()
  @IsNotEmpty()
  leaveTypeId!: string;

  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @IsInt()
  @NotEquals(0, { message: 'Days adjustment must be non-zero' })
  days!: number;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}
