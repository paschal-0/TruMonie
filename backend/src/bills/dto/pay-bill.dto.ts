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

export class PayBillDto {
  @IsUUID()
  wallet_id!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  biller_id!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  validation_ref?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  customer_ref?: string;

  @IsNumber()
  amount!: number;

  @IsEnum(Currency)
  currency!: Currency;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}$/)
  pin!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  idempotency_key!: string;
}

