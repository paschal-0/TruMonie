import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

import { MerchantStatus } from '../entities/merchant.entity';

export class AdminUpdateMerchantStatusDto {
  @IsEnum(MerchantStatus)
  status!: MerchantStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

