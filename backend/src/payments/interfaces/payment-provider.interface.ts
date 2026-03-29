import { Currency } from '../../ledger/enums/currency.enum';

export interface PaymentProvider {
  name: string;
  supportsCurrency?(currency: Currency): boolean;
  createVirtualAccount(userId: string): Promise<{ accountNumber: string; bankName: string }>;
  initiatePayout(
    userId: string,
    amountMinor: string,
    currency: Currency,
    destination: { bankCode: string; accountNumber: string; accountName?: string },
    narration?: string
  ): Promise<{ providerReference: string; status: 'PENDING' | 'SUCCESS' | 'FAILED' }>;
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
