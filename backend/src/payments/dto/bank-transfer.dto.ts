import { IsEnum, IsNotEmpty, IsOptional, IsPositive, IsString, Matches, MaxLength } from 'class-validator';

import { Currency } from '../../ledger/enums/currency.enum';

export class BankTransferDto {
  @IsPositive()
  amountMinor!: number;

  @IsEnum(Currency)
  currency!: Currency;

  @IsString()
  @IsNotEmpty()
  bankCode!: string;

  @IsString()
  @IsNotEmpty()
  accountNumber!: string;

  @IsOptional()
  @IsString()
  accountName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  narration?: string;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}$/)
  pin!: string;
}
