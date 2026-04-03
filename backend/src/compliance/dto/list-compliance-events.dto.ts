import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import { ComplianceResolution, ComplianceRiskLevel } from '../entities/compliance-event.entity';

export class ListComplianceEventsDto {
  @IsOptional()
  @IsString()
  event_type?: string;

  @IsOptional()
  @IsEnum(ComplianceRiskLevel)
  risk_level?: ComplianceRiskLevel;

  @IsOptional()
  @IsEnum(ComplianceResolution)
  resolution?: ComplianceResolution;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
