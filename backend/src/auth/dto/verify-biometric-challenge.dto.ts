import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class VerifyBiometricChallengeDto {
  @IsUUID()
  challenge_id!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  signed_attestation!: string;
}
