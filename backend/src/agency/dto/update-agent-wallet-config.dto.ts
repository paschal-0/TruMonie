import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class UpdateAgentWalletConfigDto {
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @Max(100_000_000_000)
  @IsOptional()
  float_limit?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @Max(100_000_000_000)
  @IsOptional()
  low_balance_threshold?: number;

  @IsBoolean()
  @IsOptional()
  auto_fund_enabled?: boolean;

  @IsUUID()
  @IsOptional()
  auto_fund_source?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @Max(100_000_000_000)
  @IsOptional()
  auto_fund_amount?: number;
}

