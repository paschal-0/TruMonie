import { IsDateString, IsEnum, IsNumber, IsString, Max, Min } from 'class-validator';

import { ProfitPoolType } from '../entities/profit-sharing-pool.entity';

export class CreateProfitPoolDto {
  @IsString()
  pool_name!: string;

  @IsEnum(ProfitPoolType)
  pool_type!: ProfitPoolType;

  @IsNumber()
  @Min(1)
  total_capital_minor!: number;

  @IsDateString()
  period_start!: string;

  @IsDateString()
  period_end!: string;

  @IsNumber()
  @Min(0)
  @Max(1)
  psr_investor!: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  psr_manager!: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  per_rate!: number;
}

