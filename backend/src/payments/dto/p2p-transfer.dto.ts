import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  MaxLength
} from 'class-validator';

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
  @Matches(/^(\d{4}|\d{6})$/)
  pin!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/)
  otpCode?: string;

  @IsOptional()
  @IsString()
  otpDestination?: string;

  @IsOptional()
  @IsUUID()
  biometricTicket?: string;
}
