import { IsEnum, IsNumber } from 'class-validator';

import { Currency } from '../../ledger/enums/currency.enum';

export class QuoteDto {
  @IsEnum(Currency)
  base!: Currency;

  @IsEnum(Currency)
  quote!: Currency;

  @IsNumber()
  amountMinor!: number;
}
