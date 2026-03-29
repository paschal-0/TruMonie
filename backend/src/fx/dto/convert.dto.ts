import { IsEnum, IsNotEmpty, IsNumber, IsString } from 'class-validator';

import { Currency } from '../../ledger/enums/currency.enum';

export class ConvertDto {
  @IsString()
  @IsNotEmpty()
  quoteId!: string;

  @IsEnum(Currency)
  base!: Currency;

  @IsEnum(Currency)
  quote!: Currency;

  @IsNumber()
  amountMinor!: number;
}
