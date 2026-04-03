import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested
} from 'class-validator';

import { AgentType } from '../entities/agent.entity';

class BusinessAddressDto {
  @IsString()
  @IsNotEmpty()
  street!: string;

  @IsString()
  @IsNotEmpty()
  city!: string;

  @IsString()
  @IsNotEmpty()
  state!: string;

  @IsString()
  @IsOptional()
  country?: string;
}

class GeoLocationDto {
  @Type(() => Number)
  @IsNumber()
  @IsLatitude()
  lat!: number;

  @Type(() => Number)
  @IsNumber()
  @IsLongitude()
  lng!: number;
}

export class CreateAgentDto {
  @IsString()
  @IsNotEmpty()
  business_name!: string;

  @IsEnum(AgentType)
  agent_type!: AgentType;

  @ValidateNested()
  @Type(() => BusinessAddressDto)
  business_address!: BusinessAddressDto;

  @ValidateNested()
  @Type(() => GeoLocationDto)
  geo_location!: GeoLocationDto;

  @IsUUID()
  principal_id!: string;

  @IsUUID()
  super_agent_id!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @Max(10_000_000_000)
  @IsOptional()
  float_limit?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @Max(10_000_000_000)
  @IsOptional()
  low_balance_threshold?: number;

  @IsBoolean()
  @IsOptional()
  auto_fund_enabled?: boolean;
}

