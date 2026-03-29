import { IsEnum } from 'class-validator';

import { Currency } from '../../ledger/enums/currency.enum';

export class RateDto {
  @IsEnum(Currency)
  base!: Currency;

  @IsEnum(Currency)
  quote!: Currency;
}
