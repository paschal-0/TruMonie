import { IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class SubmitLicenseRenewalDto {
  @IsObject()
  payload!: Record<string, unknown>;
}

export class SubmitPeriodicReturnDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  report_type!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  period!: string;

  @IsObject()
  data!: Record<string, unknown>;
}

export class SubmitIncidentReportDto {
  @IsObject()
  payload!: Record<string, unknown>;
}

export class SubmitAttestationDto {
  @IsObject()
  payload!: Record<string, unknown>;
}

export class ListRegulatorySubmissionsDto {
  @IsString()
  @IsOptional()
  @MaxLength(40)
  status?: string;

  @IsString()
  @IsOptional()
  @MaxLength(40)
  type?: string;
}

