import { IsEnum, IsOptional } from 'class-validator';

export enum BiometricType {
  FINGERPRINT = 'FINGERPRINT',
  FACE_ID = 'FACE_ID'
}

export class CreateBiometricChallengeDto {
  @IsOptional()
  @IsEnum(BiometricType)
  type?: BiometricType;
}
