import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Currency } from '../../ledger/enums/currency.enum';
import { PaymentProvider } from '../interfaces/payment-provider.interface';
import { PaystackClient } from '../interfaces/paystack.client';

@Injectable()
export class PaystackProvider implements PaymentProvider {
  readonly name = 'paystack';
  private readonly logger = new Logger(PaystackProvider.name);
  private readonly client: PaystackClient;

  constructor(configService: ConfigService) {
    this.client = new PaystackClient({
      secretKey: configService.get<string>('PAYSTACK_SECRET') || 'stub'
    });
  }

  supportsCurrency(currency: Currency): boolean {
    return currency === Currency.NGN;
  }

  async createVirtualAccount(request: { userId: string; currency: string; accountName?: string }) {
    // TODO: integrate Paystack virtual account API.
    this.logger.warn(`[Paystack STUB] create VA for user ${request.userId}`);
    return {
      accountNumber: '0000000000',
      bankName: 'Stub Bank',
      bankCode: '058',
      accountName: request.accountName ?? 'TruMonie User'
    };
  }

  async initiatePayout(
    userId: string,
    amountMinor: string,
    currency: Currency,
    destination: { bankCode: string; accountNumber: string; accountName?: string },
    _narration?: string
  ) {
    // TODO: integrate Paystack transfer API.
    this.logger.warn(
      `[Paystack STUB] payout ${amountMinor} ${currency} for user ${userId} to ${destination.accountNumber}`
    );
    return { providerReference: `PSTK-${Date.now()}`, status: 'PENDING' as const };
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    return this.client.verifySignature(payload, signature);
  }

  parseFundingWebhook(body: unknown) {
    const payload = body as {
      data?: {
        reference?: string;
        metadata?: { userId?: string };
        amount?: string | number;
        currency?: Currency;
      };
    };
    // TODO: map Paystack event payload.
    return {
      idempotencyKey: payload.data?.reference ?? `pstk-${Date.now()}`,
      userId: payload.data?.metadata?.userId ?? '',
      amountMinor: payload.data?.amount?.toString() ?? '0',
      currency: payload.data?.currency ?? Currency.NGN,
      reference: payload.data?.reference ?? 'unknown'
    };
  }

  async resolveBankAccount(bankCode: string, accountNumber: string) {
    return {
      bankCode,
      accountNumber,
      accountName: 'Stubbed Name'
    };
  }
}
