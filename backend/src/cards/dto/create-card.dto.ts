import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

import { Currency } from '../../ledger/enums/currency.enum';

export class CreateCardDto {
  @IsUUID()
  fundingAccountId!: string;

  @IsEnum(Currency)
  currency!: Currency;

  @IsOptional()
  @IsString()
  provider?: string;
}
