import { IsInt, IsOptional, IsString, IsUUID, Matches, MaxLength, Min } from 'class-validator';

export class InternalTransferV2Dto {
  @IsUUID()
  source_wallet_id!: string;

  @IsUUID()
  destination_wallet_id!: string;

  @IsInt()
  @Min(1)
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  narration?: string;

  @IsString()
  @Matches(/^(\d{4}|\d{6})$/)
  pin!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/)
  otp_code?: string;

  @IsOptional()
  @IsString()
  otp_destination?: string;

  @IsOptional()
  @IsUUID()
  biometric_ticket?: string;

  @IsUUID()
  idempotency_key!: string;
}
