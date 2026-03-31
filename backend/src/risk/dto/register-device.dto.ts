import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class RegisterDeviceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  fingerprint!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  deviceType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  platform?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  osVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  appVersion?: string;
}
