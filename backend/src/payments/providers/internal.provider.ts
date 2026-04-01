import { Injectable } from '@nestjs/common';

import { Currency } from '../../ledger/enums/currency.enum';
import { PaymentProvider } from '../interfaces/payment-provider.interface';

@Injectable()
export class InternalPaymentProvider implements PaymentProvider {
  readonly name = 'internal';

  supportsCurrency(_currency: Currency): boolean {
    return true;
  }

  async createVirtualAccount(request: { userId: string; currency: string; accountName?: string }) {
    return {
      accountNumber: 'INTERNAL_LEDGER',
      bankName: 'Internal Settlement',
      bankCode: '000',
      accountName: request.accountName ?? `Wallet ${request.userId}`
    };
  }

  async initiatePayout(
    _userId: string,
    _amountMinor: string,
    _currency: Currency,
    destination: { bankCode: string; accountNumber: string; accountName?: string }
  ) {
    void destination;
    return {
      providerReference: `INTERNAL-${Date.now()}`,
      status: 'SUCCESS' as const
    };
  }

  verifyWebhookSignature(_payload: string, _signature: string): boolean {
    return true;
  }

  parseFundingWebhook(body: unknown) {
    const payload = body as {
      idempotencyKey?: string;
      reference?: string;
      userId?: string;
      amountMinor?: string | number;
      currency?: Currency;
    };
    return {
      idempotencyKey: payload.idempotencyKey ?? payload.reference ?? `internal-${Date.now()}`,
      userId: payload.userId ?? '',
      amountMinor: payload.amountMinor?.toString() ?? '0',
      currency: payload.currency ?? Currency.NGN,
      reference: payload.reference ?? `INTERNAL-FUND-${Date.now()}`
    };
  }

  async resolveBankAccount(bankCode: string, accountNumber: string) {
    return {
      bankCode,
      accountNumber,
      accountName: 'Internal Settlement Account'
    };
  }
}
