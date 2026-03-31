import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class DeviceFingerprintDto {
  @Transform(({ value, obj }) => value ?? obj.hardware_id)
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  hardwareId!: string;

  @IsString()
  @IsIn(['android', 'ios'])
  platform!: 'android' | 'ios';

  @Transform(({ value, obj }) => value ?? obj.os_version)
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  osVersion!: string;

  @Transform(({ value, obj }) => value ?? obj.app_version)
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  appVersion!: string;

  @Transform(({ value, obj }) => value ?? obj.screen_resolution)
  @IsOptional()
  @IsString()
  @MaxLength(32)
  screenResolution?: string;
}
