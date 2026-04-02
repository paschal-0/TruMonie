import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested
} from 'class-validator';

import { Currency } from '../../ledger/enums/currency.enum';
import { MerchantTransactionChannel } from '../entities/merchant-transaction.entity';

class GeoPointDto {
  @Type(() => Number)
  @IsNumber()
  lat!: number;

  @Type(() => Number)
  @IsNumber()
  lng!: number;
}

export class PosChargeDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{8}$/)
  terminal_id!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  amount_minor!: number;

  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @IsEnum(MerchantTransactionChannel)
  channel!: MerchantTransactionChannel;

  @ValidateNested()
  @Type(() => GeoPointDto)
  txn_location!: GeoPointDto;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  metadata?: Record<string, unknown>;
}

