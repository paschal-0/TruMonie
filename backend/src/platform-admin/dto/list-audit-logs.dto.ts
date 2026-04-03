import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ListAuditLogsDto {
  @IsOptional()
  @IsDateString()
  start_date?: string;

  @IsOptional()
  @IsDateString()
  end_date?: string;

  @IsOptional()
  @IsUUID()
  actor_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  @IsIn(['USER', 'ADMIN', 'SYSTEM'])
  actor_type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  resource_type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @IsIn(['CREATE', 'UPDATE', 'DELETE', 'VIEW'])
  action?: string;

  @IsOptional()
  @IsUUID()
  correlation_id?: string;
}

