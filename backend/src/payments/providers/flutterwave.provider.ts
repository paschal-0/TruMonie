import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Currency } from '../../ledger/enums/currency.enum';
import { PaymentProvider } from '../interfaces/payment-provider.interface';
import { FlutterwaveClient } from '../interfaces/flutterwave.client';

@Injectable()
export class FlutterwaveProvider implements PaymentProvider {
  readonly name = 'flutterwave';
  private readonly logger = new Logger(FlutterwaveProvider.name);
  private readonly client: FlutterwaveClient;

  constructor(configService: ConfigService) {
    this.client = new FlutterwaveClient({
      secretHash: configService.get<string>('FLW_SECRET_HASH') || 'stub'
    });
  }

  supportsCurrency(currency: Currency): boolean {
    return currency === Currency.NGN;
  }

  async createVirtualAccount(request: { userId: string; currency: string; accountName?: string }) {
    // TODO: integrate Flutterwave virtual account API.
    this.logger.warn(`[Flutterwave STUB] create VA for user ${request.userId}`);
    return {
      accountNumber: '1000000000',
      bankName: 'Stubwave Bank',
      bankCode: '214',
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
    // TODO: integrate Flutterwave transfer API.
    this.logger.warn(
      `[Flutterwave STUB] payout ${amountMinor} ${currency} for user ${userId} to ${destination.accountNumber}`
    );
    return { providerReference: `FLW-${Date.now()}`, status: 'PENDING' as const };
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    return this.client.verifySignature(payload, signature);
  }

  parseFundingWebhook(body: unknown) {
    const payload = body as {
      data?: {
        id?: string | number;
        meta?: { userId?: string };
        amount?: string | number;
        currency?: Currency;
        tx_ref?: string;
      };
    };
    // TODO: map Flutterwave event payload.
    return {
      idempotencyKey: payload.data?.id?.toString() ?? `flw-${Date.now()}`,
      userId: payload.data?.meta?.userId ?? '',
      amountMinor: payload.data?.amount?.toString() ?? '0',
      currency: payload.data?.currency ?? Currency.NGN,
      reference: payload.data?.tx_ref ?? 'unknown'
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
