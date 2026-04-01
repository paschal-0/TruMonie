import { Currency } from '../../ledger/enums/currency.enum';

export interface PaymentProvider {
  name: string;
  supportsCurrency?(currency: Currency): boolean;
  createVirtualAccount(request: {
    userId: string;
    currency: string;
    accountName?: string;
  }): Promise<{
    accountNumber: string;
    bankName: string;
    bankCode?: string;
    accountName?: string;
  }>;
  initiatePayout(
    userId: string,
    amountMinor: string,
    currency: Currency,
    destination: { bankCode: string; accountNumber: string; accountName?: string },
    narration?: string
  ): Promise<{
    providerReference: string;
    status: 'PENDING' | 'SUCCESS' | 'FAILED';
    responseCode?: string;
    responseMessage?: string;
    sessionId?: string;
  }>;
  queryTransferStatus?(params: {
    providerReference?: string;
    reference: string;
    sessionId?: string;
  }): Promise<{
    status: 'PENDING' | 'SUCCESS' | 'FAILED';
    responseCode: string;
    responseMessage: string;
    completedAt?: string;
  }>;
  verifyWebhookSignature(payload: string, signature: string): boolean;
  parseFundingWebhook(body: unknown): {
    idempotencyKey: string;
    userId: string;
    amountMinor: string;
    currency: Currency;
    reference: string;
  };
  resolveBankAccount?(
    bankCode: string,
    accountNumber: string
  ): Promise<{ bankCode: string; accountNumber: string; accountName: string }>;
}
