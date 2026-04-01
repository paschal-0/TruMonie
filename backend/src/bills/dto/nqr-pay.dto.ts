import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength
} from 'class-validator';

import { Currency } from '../../ledger/enums/currency.enum';

export class NqrPayDto {
  @IsUUID()
  wallet_id!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  qr_data!: string;

  @IsNumber()
  amount!: number;

  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}$/)
  pin!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  idempotency_key!: string;
}

