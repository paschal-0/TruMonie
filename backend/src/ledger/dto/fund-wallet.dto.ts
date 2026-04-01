import {
  IsEnum,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID
} from 'class-validator';

import { Currency } from '../enums/currency.enum';

export enum WalletFundingChannel {
  BANK_TRANSFER = 'BANK_TRANSFER',
  CARD = 'CARD',
  USSD = 'USSD',
  VIRTUAL_ACCOUNT = 'VIRTUAL_ACCOUNT'
}

export class FundWalletDto {
  @IsUUID()
  walletId!: string;

  @IsNumberString()
  amount!: string;

  @IsEnum(Currency)
  currency!: Currency;

  @IsEnum(WalletFundingChannel)
  channel!: WalletFundingChannel;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  cardToken?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @IsOptional()
  @IsString()
  provider?: string;
}
