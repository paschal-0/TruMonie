import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength
} from 'class-validator';

import { Currency } from '../../ledger/enums/currency.enum';

export class InternalFundingDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsPositive()
  amountMinor!: number;

  @IsEnum(Currency)
  currency!: Currency;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
