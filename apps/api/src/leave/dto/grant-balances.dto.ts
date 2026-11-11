import { IsInt, Max, Min } from 'class-validator';

export class GrantBalancesDto {
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;
}
