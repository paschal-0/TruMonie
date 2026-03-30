import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  ValidateNested
} from 'class-validator';

import { Currency } from '../../ledger/enums/currency.enum';

class RemittanceDestinationDto {
  @IsString()
  @IsNotEmpty()
  country!: string;

  @IsString()
  @IsNotEmpty()
  bankCode!: string;

  @IsString()
  @IsNotEmpty()
  accountNumber!: string;

  @IsOptional()
  @IsString()
  accountName?: string;
}

export class OutboundRemittanceDto {
  @IsNumber()
  amountMinor!: number;

  @IsEnum(Currency)
  currency!: Currency;

  @ValidateNested()
  @Type(() => RemittanceDestinationDto)
  destination!: RemittanceDestinationDto;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  narration?: string;

  @IsString()
  @Matches(/^\d{4}$/)
  pin!: string;
}
