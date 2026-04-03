import { IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class SetSystemConfigDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  config_key!: string;

  @IsObject()
  config_value!: Record<string, unknown>;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;
}

