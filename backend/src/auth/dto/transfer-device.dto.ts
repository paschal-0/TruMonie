import { Transform, Type } from 'class-transformer';
import { IsNotEmpty, IsString, ValidateNested } from 'class-validator';

import { DeviceFingerprintDto } from './device-fingerprint.dto';

export class TransferDeviceDto {
  @Transform(({ value, obj }) => value ?? obj.new_device_fingerprint)
  @ValidateNested()
  @Type(() => DeviceFingerprintDto)
  newDeviceFingerprint!: DeviceFingerprintDto;

  @IsString()
  @IsNotEmpty()
  otp!: string;
}
