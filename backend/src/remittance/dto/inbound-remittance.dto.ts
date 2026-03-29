import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

import { Currency } from '../../ledger/enums/currency.enum';

export class InboundRemittanceDto {
  @IsNumber()
  amountMinor!: number;

  @IsEnum(Currency)
  currency!: Currency;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  reference?: string;
}
