import { IsEnum, IsNotEmpty, IsOptional, IsPositive, IsString } from 'class-validator';

import { Currency } from '../../ledger/enums/currency.enum';

export class CreateVaultDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEnum(Currency)
  currency!: Currency;

  @IsPositive()
  targetAmountMinor!: number;

  @IsOptional()
  lockedUntil?: Date;
}
