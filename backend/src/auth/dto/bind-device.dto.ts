import { Transform, Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';

import { DeviceFingerprintDto } from './device-fingerprint.dto';

export class BindDeviceDto {
  @Transform(({ value, obj }) => value ?? obj.device_fingerprint)
  @ValidateNested()
  @Type(() => DeviceFingerprintDto)
  deviceFingerprint!: DeviceFingerprintDto;
}
