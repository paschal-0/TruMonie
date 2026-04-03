import { IsDateString, IsNumber, Min } from 'class-validator';

export class DistributeProfitDto {
  @IsDateString()
  period!: string;

  @IsNumber()
  @Min(0)
  gross_earnings_minor!: number;

  @IsNumber()
  @Min(0)
  expenses_minor!: number;
}

