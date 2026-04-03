import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min
} from 'class-validator';

export class CreateTransferDto {
  @IsUUID()
  source_wallet_id!: string;

  @IsString()
  @Matches(/^\d{3}$/)
  destination_bank_code!: string;

  @IsString()
  @Matches(/^\d{10}$/)
  destination_account!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  destination_name!: string;

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

  @IsOptional()
  @IsString()
  session_id?: string;

  @IsOptional()
  @IsString()
  provider?: string;
}
