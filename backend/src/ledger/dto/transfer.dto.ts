import { IsEnum, IsNotEmpty, IsOptional, IsPositive, IsString, Matches, MaxLength } from 'class-validator';

import { Currency } from '../enums/currency.enum';

export class TransferDto {
  @IsString()
  @IsNotEmpty()
  sourceAccountId!: string;

  @IsString()
  @IsNotEmpty()
  destinationAccountId!: string;

  @IsPositive()
  amountMinor!: number;

  @IsEnum(Currency)
  currency!: Currency;

  @IsOptional()
  @IsPositive()
  feeAmountMinor?: number;

  @IsOptional()
  @IsString()
  feeAccountId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^(\d{4}|\d{6})$/)
  pin!: string;
}
