import { Injectable, Logger } from '@nestjs/common';

import { BillsProvider } from '../interfaces/bills-provider.interface';

@Injectable()
export class BillsAggregatorStub implements BillsProvider {
  readonly name = 'stub';
  private readonly logger = new Logger(BillsAggregatorStub.name);

  supportsCurrency(currency: string): boolean {
    return currency === 'NGN';
  }

  async listCatalog() {
    // TODO: integrate real bills aggregator (Flutterwave/Paystack/Interswitch).
    return [
      { code: 'AIRTIME_MTN', name: 'MTN Airtime', category: 'airtime', amountType: 'variable' as const },
      {
        code: 'DATA_MTN_1GB',
        name: 'MTN Data 1GB',
        category: 'data',
        amountType: 'fixed' as const,
        amountMinor: 100000
      },
      {
        code: 'POWER_IKEJA_PREPAID',
        name: 'Ikeja Electric Prepaid',
        category: 'electricity',
        amountType: 'variable' as const
      }
    ];
  }

  async purchase(payload: {
    productCode: string;
    beneficiary: string;
    amountMinor: string;
    currency: string;
    reference: string;
  }) {
    this.logger.warn(`[BILLS STUB] Purchasing ${payload.productCode} for ${payload.beneficiary}`);
    return {
      status: 'PENDING' as const,
      providerReference: payload.reference,
      metadata: { stub: true }
    };
  }
}
