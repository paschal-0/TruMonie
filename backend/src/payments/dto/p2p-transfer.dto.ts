import { IsEnum, IsNotEmpty, IsOptional, IsPositive, IsString, Matches, MaxLength } from 'class-validator';

import { Currency } from '../../ledger/enums/currency.enum';

export class P2PTransferDto {
  @IsString()
  @IsNotEmpty()
  recipientIdentifier!: string; // email/phone/username

  @IsPositive()
  amountMinor!: number;

  @IsEnum(Currency)
  currency!: Currency;

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
  @Matches(/^\d{4}$/)
  pin!: string;
}
