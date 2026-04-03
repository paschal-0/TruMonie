import { IsDateString, IsOptional, Matches } from 'class-validator';

export class CoreBankingAsOfQueryDto {
  @IsOptional()
  @IsDateString()
  as_of?: string;
}

export class CoreBankingRangeQueryDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;
}

export class Mmfbr300QueryDto {
  @Matches(/^\d{4}-\d{2}$/)
  month!: string;
}

