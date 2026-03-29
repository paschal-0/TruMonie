import { IsEnum, IsInt, IsNotEmpty, IsPositive, IsString, MaxLength } from 'class-validator';

import { Currency } from '../../ledger/enums/currency.enum';

export class CreateGroupDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsEnum(Currency)
  currency!: Currency;

  @IsPositive()
  contributionAmountMinor!: number;

  @IsInt()
  @IsPositive()
  memberTarget!: number;
}
