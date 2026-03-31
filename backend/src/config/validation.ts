import { plainToInstance } from 'class-transformer';
import { IsBoolean, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, validateSync } from 'class-validator';

class EnvironmentVariables {
  @IsEnum(['development', 'test', 'production'])
  @IsOptional()
  NODE_ENV?: string;

  @IsNumber()
  @IsOptional()
  PORT?: number;

  @IsString()
  @IsNotEmpty()
  POSTGRES_HOST!: string;

  @IsNumber()
  POSTGRES_PORT!: number;

  @IsString()
  @IsNotEmpty()
  POSTGRES_USER!: string;

  @IsString()
  @IsNotEmpty()
  POSTGRES_PASSWORD!: string;

  @IsString()
  @IsNotEmpty()
  POSTGRES_DB!: string;

  @IsBoolean()
  @IsOptional()
  POSTGRES_SSL?: boolean;

  @IsString()
  @IsNotEmpty()
  REDIS_HOST!: string;

  @IsNumber()
  REDIS_PORT!: number;

  @IsString()
  @IsOptional()
  REDIS_PASSWORD?: string;

  @IsString()
  @IsNotEmpty()
  JWT_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  JWT_EXPIRES_IN!: string;

  @IsString()
  @IsNotEmpty()
  REFRESH_JWT_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  REFRESH_JWT_EXPIRES_IN!: string;

  @IsString()
  @IsNotEmpty()
  PII_ENCRYPTION_KEY!: string;

  @IsString()
  @IsOptional()
  KYC_VENDOR_API_KEY?: string;

  @IsString()
  @IsOptional()
  SYSTEM_TREASURY_NGN_ACCOUNT_ID?: string;

  @IsString()
  @IsOptional()
  SYSTEM_TREASURY_USD_ACCOUNT_ID?: string;

  @IsString()
  @IsOptional()
  SYSTEM_FEES_NGN_ACCOUNT_ID?: string;

  @IsString()
  @IsOptional()
  SYSTEM_FEES_USD_ACCOUNT_ID?: string;

  @IsString()
  @IsOptional()
  SYSTEM_SETTLEMENT_INTERNAL_NGN_ACCOUNT_ID?: string;

  @IsString()
  @IsOptional()
  SYSTEM_SETTLEMENT_INTERNAL_USD_ACCOUNT_ID?: string;

  @IsString()
  @IsOptional()
  SYSTEM_SETTLEMENT_LICENSED_NGN_ACCOUNT_ID?: string;

  @IsString()
  @IsOptional()
  SYSTEM_SETTLEMENT_LICENSED_USD_ACCOUNT_ID?: string;

  @IsString()
  @IsOptional()
  SYSTEM_SETTLEMENT_PAYSTACK_NGN_ACCOUNT_ID?: string;

  @IsString()
  @IsOptional()
  SYSTEM_SETTLEMENT_PAYSTACK_USD_ACCOUNT_ID?: string;

  @IsString()
  @IsOptional()
  SYSTEM_SETTLEMENT_FLUTTERWAVE_NGN_ACCOUNT_ID?: string;

  @IsString()
  @IsOptional()
  SYSTEM_SETTLEMENT_FLUTTERWAVE_USD_ACCOUNT_ID?: string;

  @IsString()
  @IsOptional()
  DEFAULT_PAYMENT_PROVIDER?: string;

  @IsString()
  @IsOptional()
  DEFAULT_BILLS_PROVIDER?: string;

  @IsString()
  @IsOptional()
  DEFAULT_KYC_PROVIDER?: string;

  @IsString()
  @IsOptional()
  DEFAULT_FX_PROVIDER?: string;

  @IsString()
  @IsOptional()
  DEFAULT_CARDS_PROVIDER?: string;

  @IsString()
  @IsOptional()
  DEFAULT_OTP_PROVIDER?: string;

  @IsString()
  @IsOptional()
  DEFAULT_NOTIFICATION_PROVIDER?: string;

  @IsString()
  @IsOptional()
  LICENSED_INFRA_BASE_URL?: string;

  @IsString()
  @IsOptional()
  LICENSED_INFRA_API_KEY?: string;

  @IsNumber()
  @IsOptional()
  LICENSED_INFRA_TIMEOUT_MS?: number;

  @IsString()
  @IsOptional()
  LICENSED_INFRA_WEBHOOK_SECRET?: string;

  @IsString()
  @IsOptional()
  LICENSED_INFRA_PAYMENTS_VIRTUAL_ACCOUNT_PATH?: string;

  @IsString()
  @IsOptional()
  LICENSED_INFRA_PAYMENTS_PAYOUT_PATH?: string;

  @IsString()
  @IsOptional()
  LICENSED_INFRA_PAYMENTS_RESOLVE_PATH?: string;

  @IsString()
  @IsOptional()
  LICENSED_INFRA_BILLS_CATALOG_PATH?: string;

  @IsString()
  @IsOptional()
  LICENSED_INFRA_BILLS_PURCHASE_PATH?: string;

  @IsString()
  @IsOptional()
  LICENSED_INFRA_KYC_VERIFY_PATH?: string;

  @IsString()
  @IsOptional()
  LICENSED_INFRA_FX_RATE_PATH?: string;

  @IsString()
  @IsOptional()
  LICENSED_INFRA_CARDS_CREATE_PATH?: string;

  @IsString()
  @IsOptional()
  LICENSED_INFRA_CARDS_BLOCK_PATH?: string;

  @IsString()
  @IsOptional()
  LICENSED_INFRA_CARDS_UNBLOCK_PATH?: string;

  @IsString()
  @IsOptional()
  LICENSED_INFRA_OTP_SEND_PATH?: string;

  @IsString()
  @IsOptional()
  LICENSED_INFRA_NOTIFICATIONS_SEND_PATH?: string;

  @IsString()
  @IsOptional()
  TWILIO_ACCOUNT_SID?: string;

  @IsString()
  @IsOptional()
  TWILIO_AUTH_TOKEN?: string;

  @IsString()
  @IsOptional()
  TWILIO_FROM_NUMBER?: string;

  @IsString()
  @IsOptional()
  TWILIO_MESSAGING_SERVICE_SID?: string;

  @IsString()
  @IsOptional()
  TWILIO_BASE_URL?: string;

  @IsNumber()
  @IsOptional()
  TWILIO_TIMEOUT_MS?: number;

  @IsString()
  @IsOptional()
  RESEND_API_KEY?: string;

  @IsString()
  @IsOptional()
  RESEND_FROM_EMAIL?: string;

  @IsString()
  @IsOptional()
  RESEND_BASE_URL?: string;

  @IsNumber()
  @IsOptional()
  RESEND_TIMEOUT_MS?: number;

  @IsString()
  @IsOptional()
  INTERSWITCH_CLIENT_ID?: string;

  @IsString()
  @IsOptional()
  INTERSWITCH_CLIENT_SECRET?: string;

  @IsString()
  @IsOptional()
  INTERSWITCH_OAUTH_BASE_URL?: string;

  @IsString()
  @IsOptional()
  INTERSWITCH_OAUTH_TOKEN_PATH?: string;

  @IsString()
  @IsOptional()
  INTERSWITCH_SCOPE?: string;

  @IsString()
  @IsOptional()
  INTERSWITCH_GRANT_TYPE?: string;

  @IsString()
  @IsOptional()
  INTERSWITCH_ROUTING_BASE_URL?: string;

  @IsString()
  @IsOptional()
  INTERSWITCH_BVN_VERIFY_PATH?: string;

  @IsString()
  @IsOptional()
  INTERSWITCH_NIN_VERIFY_PATH?: string;

  @IsString()
  @IsOptional()
  INTERSWITCH_FACE_COMPARE_PATH?: string;

  @IsNumber()
  @IsOptional()
  INTERSWITCH_TIMEOUT_MS?: number;
}

export function validateEnv(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false
  });

  if (errors.length > 0) {
    throw new Error(`Environment validation error: ${errors.toString()}`);
  }
  return validatedConfig;
}
