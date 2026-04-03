import { IsEnum, IsNotEmpty, IsNumber, IsString, IsUUID, Min } from 'class-validator';

import { FraudReportType } from '../entities/fraud-report.entity';

export class CreateFraudReportDto {
  @IsUUID()
  transaction_id!: string;

  @IsEnum(FraudReportType)
  report_type!: FraudReportType;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsNumber()
  @Min(1)
  reported_amount!: number;
}
