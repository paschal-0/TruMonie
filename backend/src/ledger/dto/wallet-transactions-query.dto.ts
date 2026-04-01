import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min
} from 'class-validator';

export class WalletTransactionsQueryDto {
  @IsOptional()
  @IsDateString()
  start_date?: string;

  @IsOptional()
  @IsDateString()
  end_date?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsIn(['PENDING', 'SUCCESS', 'FAILED', 'REVERSED'])
  status?: string;

  @IsOptional()
  @IsIn(['CREDIT', 'DEBIT'])
  type?: string;

  @IsOptional()
  @Matches(/^\d+$/)
  min_amount?: string;

  @IsOptional()
  @Matches(/^\d+$/)
  max_amount?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  per_page?: number;
}
