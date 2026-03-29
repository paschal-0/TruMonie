import { IsEnum, IsPositive, IsString, IsUUID } from 'class-validator';

import { Currency } from '../../ledger/enums/currency.enum';

export class VaultTransactionDto {
  @IsUUID()
  vaultId!: string;

  @IsEnum(Currency)
  currency!: Currency;

  @IsPositive()
  amountMinor!: number;

  @IsString()
  reference!: string;
}
