import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

import { Currency } from '../../ledger/enums/currency.enum';

export class PurchaseBillDto {
  @IsString()
  @IsNotEmpty()
  productCode!: string;

  @IsString()
  @IsNotEmpty()
  beneficiary!: string; // phone/meter/card number

  @IsNumber()
  amountMinor!: number;

  @IsEnum(Currency)
  currency!: Currency;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}$/)
  pin!: string;
}
