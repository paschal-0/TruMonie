import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested
} from 'class-validator';

import { MerchantBusinessType } from '../entities/merchant.entity';
import { SettlementCycle } from '../entities/settlement.entity';

class AddressDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  street!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  state!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;
}

class GeoLocationDto {
  @Type(() => Number)
  @IsNumber()
  lat!: number;

  @Type(() => Number)
  @IsNumber()
  lng!: number;
}

export class CreateMerchantDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  business_name!: string;

  @IsEnum(MerchantBusinessType)
  business_type!: MerchantBusinessType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  @Matches(/^\d{3,10}$/)
  category_code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  tin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  rc_number?: string;

  @IsString()
  @Matches(/^\d{10,20}$/)
  settlement_account!: string;

  @IsString()
  @Matches(/^\d{3,10}$/)
  settlement_bank!: string;

  @ValidateNested()
  @Type(() => AddressDto)
  @IsObject()
  address!: AddressDto;

  @ValidateNested()
  @Type(() => GeoLocationDto)
  @IsObject()
  geo_location!: GeoLocationDto;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  geo_fence_radius?: number;

  @IsOptional()
  @IsEnum(SettlementCycle)
  settlement_cycle?: SettlementCycle;
}
