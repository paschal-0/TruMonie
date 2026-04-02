import { Currency } from '../../ledger/enums/currency.enum';
import { MerchantTransactionChannel } from '../entities/merchant-transaction.entity';

export interface PtsaChargeParams {
  merchantId: string;
  merchantCode: string;
  terminalId: string;
  reference: string;
  amountMinor: string;
  currency: Currency;
  channel: MerchantTransactionChannel;
  metadata?: Record<string, unknown>;
}

export interface PtsaChargeResult {
  providerReference: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  responseCode?: string;
  responseMessage?: string;
  authCode?: string;
}

export interface PtsaStatusResult {
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  responseCode: string;
  responseMessage: string;
  completedAt?: string;
}

export interface PtsaProvider {
  name: string;
  charge(params: PtsaChargeParams): Promise<PtsaChargeResult>;
  queryStatus?(params: { reference: string; providerReference?: string }): Promise<PtsaStatusResult>;
}

