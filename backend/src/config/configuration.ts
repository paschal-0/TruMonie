import { Currency } from '../ledger/enums/currency.enum';

export interface AppConfig {
  env: string;
  port: number;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  name: string;
  ssl?: boolean;
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
}

export interface JwtConfig {
  secret: string;
  expiresIn: string | number;
  refreshSecret: string;
  refreshExpiresIn: string | number;
}

export interface SystemAccountsConfig {
  treasury: Partial<Record<Currency, string | undefined>>;
  fees: Partial<Record<Currency, string | undefined>>;
  settlement: Record<string, Partial<Record<Currency, string | undefined>>>;
}

export interface KycConfig {
  vendorApiKey?: string;
  piiKey: string;
}

export interface IntegrationsConfig {
  defaultPaymentProvider: string;
  defaultBillsProvider: string;
  defaultKycProvider: string;
  defaultFxProvider: string;
  defaultCardsProvider: string;
  defaultOtpProvider: string;
  defaultNotificationProvider: string;
  licensed: {
    baseUrl?: string;
    apiKey?: string;
    timeoutMs: number;
    webhookSecret?: string;
    paymentsVirtualAccountPath: string;
    paymentsPayoutPath: string;
    paymentsResolvePath: string;
    billsCatalogPath: string;
    billsPurchasePath: string;
    kycVerifyPath: string;
    fxRatePath: string;
    cardsCreatePath: string;
    cardsBlockPath: string;
    cardsUnblockPath: string;
    otpSendPath: string;
    notificationsSendPath: string;
  };
  twilio: {
    accountSid?: string;
    authToken?: string;
    fromNumber?: string;
    messagingServiceSid?: string;
    baseUrl: string;
    timeoutMs: number;
  };
  interswitch: {
    clientId?: string;
    clientSecret?: string;
    oauthBaseUrl: string;
    oauthTokenPath: string;
    scope: string;
    grantType: string;
    routingBaseUrl: string;
    bvnVerifyPath: string;
    ninVerifyPath: string;
    faceComparePath: string;
    timeoutMs: number;
  };
}

export default () => ({
  app: {
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3000', 10)
  } as AppConfig,
  database: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    username: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
    name: process.env.POSTGRES_DB || 'trumonie',
    ssl: process.env.POSTGRES_SSL === 'true' || process.env.POSTGRES_SSL === '1'
  } as DatabaseConfig,
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD
  } as RedisConfig,
  jwt: {
    secret: process.env.JWT_SECRET || 'change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '3600s',
    refreshSecret: process.env.REFRESH_JWT_SECRET || 'change-me-refresh',
    refreshExpiresIn: process.env.REFRESH_JWT_EXPIRES_IN || '7d'
  } as JwtConfig,
  systemAccounts: {
    treasury: {
      [Currency.NGN]: process.env.SYSTEM_TREASURY_NGN_ACCOUNT_ID,
      [Currency.USD]: process.env.SYSTEM_TREASURY_USD_ACCOUNT_ID
    },
    fees: {
      [Currency.NGN]: process.env.SYSTEM_FEES_NGN_ACCOUNT_ID,
      [Currency.USD]: process.env.SYSTEM_FEES_USD_ACCOUNT_ID
    },
    settlement: {
      internal: {
        [Currency.NGN]: process.env.SYSTEM_SETTLEMENT_INTERNAL_NGN_ACCOUNT_ID,
        [Currency.USD]: process.env.SYSTEM_SETTLEMENT_INTERNAL_USD_ACCOUNT_ID
      },
      licensed: {
        [Currency.NGN]: process.env.SYSTEM_SETTLEMENT_LICENSED_NGN_ACCOUNT_ID,
        [Currency.USD]: process.env.SYSTEM_SETTLEMENT_LICENSED_USD_ACCOUNT_ID
      },
      paystack: {
        [Currency.NGN]: process.env.SYSTEM_SETTLEMENT_PAYSTACK_NGN_ACCOUNT_ID,
        [Currency.USD]: process.env.SYSTEM_SETTLEMENT_PAYSTACK_USD_ACCOUNT_ID
      },
      flutterwave: {
        [Currency.NGN]: process.env.SYSTEM_SETTLEMENT_FLUTTERWAVE_NGN_ACCOUNT_ID,
        [Currency.USD]: process.env.SYSTEM_SETTLEMENT_FLUTTERWAVE_USD_ACCOUNT_ID
      }
    }
  } as SystemAccountsConfig,
  kyc: {
    vendorApiKey: process.env.KYC_VENDOR_API_KEY,
    piiKey: process.env.PII_ENCRYPTION_KEY
  } as KycConfig,
  integrations: {
    defaultPaymentProvider: process.env.DEFAULT_PAYMENT_PROVIDER || 'licensed',
    defaultBillsProvider: process.env.DEFAULT_BILLS_PROVIDER || 'licensed',
    defaultKycProvider: process.env.DEFAULT_KYC_PROVIDER || 'licensed',
    defaultFxProvider: process.env.DEFAULT_FX_PROVIDER || 'licensed',
    defaultCardsProvider: process.env.DEFAULT_CARDS_PROVIDER || 'licensed',
    defaultOtpProvider: process.env.DEFAULT_OTP_PROVIDER || 'licensed',
    defaultNotificationProvider: process.env.DEFAULT_NOTIFICATION_PROVIDER || 'licensed',
    licensed: {
      baseUrl: process.env.LICENSED_INFRA_BASE_URL,
      apiKey: process.env.LICENSED_INFRA_API_KEY,
      timeoutMs: parseInt(process.env.LICENSED_INFRA_TIMEOUT_MS || '10000', 10),
      webhookSecret: process.env.LICENSED_INFRA_WEBHOOK_SECRET,
      paymentsVirtualAccountPath:
        process.env.LICENSED_INFRA_PAYMENTS_VIRTUAL_ACCOUNT_PATH || '/payments/virtual-accounts',
      paymentsPayoutPath: process.env.LICENSED_INFRA_PAYMENTS_PAYOUT_PATH || '/payments/payouts',
      paymentsResolvePath:
        process.env.LICENSED_INFRA_PAYMENTS_RESOLVE_PATH || '/payments/accounts/resolve',
      billsCatalogPath: process.env.LICENSED_INFRA_BILLS_CATALOG_PATH || '/bills/catalog',
      billsPurchasePath: process.env.LICENSED_INFRA_BILLS_PURCHASE_PATH || '/bills/purchase',
      kycVerifyPath: process.env.LICENSED_INFRA_KYC_VERIFY_PATH || '/kyc/verify',
      fxRatePath: process.env.LICENSED_INFRA_FX_RATE_PATH || '/fx/rate',
      cardsCreatePath: process.env.LICENSED_INFRA_CARDS_CREATE_PATH || '/cards',
      cardsBlockPath: process.env.LICENSED_INFRA_CARDS_BLOCK_PATH || '/cards/block',
      cardsUnblockPath: process.env.LICENSED_INFRA_CARDS_UNBLOCK_PATH || '/cards/unblock',
      otpSendPath: process.env.LICENSED_INFRA_OTP_SEND_PATH || '/otp/send',
      notificationsSendPath:
        process.env.LICENSED_INFRA_NOTIFICATIONS_SEND_PATH || '/notifications/send'
    },
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      fromNumber: process.env.TWILIO_FROM_NUMBER,
      messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID,
      baseUrl: process.env.TWILIO_BASE_URL || 'https://api.twilio.com',
      timeoutMs: parseInt(process.env.TWILIO_TIMEOUT_MS || '10000', 10)
    },
    interswitch: {
      clientId: process.env.INTERSWITCH_CLIENT_ID,
      clientSecret: process.env.INTERSWITCH_CLIENT_SECRET,
      oauthBaseUrl: process.env.INTERSWITCH_OAUTH_BASE_URL || 'https://qa.interswitchng.com',
      oauthTokenPath: process.env.INTERSWITCH_OAUTH_TOKEN_PATH || '/passport/oauth/token',
      scope: process.env.INTERSWITCH_SCOPE || 'profile',
      grantType: process.env.INTERSWITCH_GRANT_TYPE || 'client_credentials',
      routingBaseUrl:
        process.env.INTERSWITCH_ROUTING_BASE_URL ||
        'https://api-marketplace-routing.k8.isw.la/marketplace-routing/api/v1',
      bvnVerifyPath:
        process.env.INTERSWITCH_BVN_VERIFY_PATH || '/verify/identity/bvn/verify',
      ninVerifyPath:
        process.env.INTERSWITCH_NIN_VERIFY_PATH || '/verify/identity/nin/verify',
      faceComparePath:
        process.env.INTERSWITCH_FACE_COMPARE_PATH ||
        '/verify/identity/face-comparison',
      timeoutMs: parseInt(process.env.INTERSWITCH_TIMEOUT_MS || '10000', 10)
    }
  } as IntegrationsConfig
});
