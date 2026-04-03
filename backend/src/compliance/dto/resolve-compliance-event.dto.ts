import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

import { ComplianceResolution } from '../entities/compliance-event.entity';

export class ResolveComplianceEventDto {
  @IsEnum(ComplianceResolution)
  resolution!: ComplianceResolution;

  @IsOptional()
  @IsBoolean()
  nfiu_reported?: boolean;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nfiu_report_ref?: string;
}
