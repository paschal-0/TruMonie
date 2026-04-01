import { Injectable, Logger } from '@nestjs/common';

import {
  BillCategoryDefinition,
  BillValidationResult,
  BillsProvider
} from '../interfaces/bills-provider.interface';

@Injectable()
export class BillsAggregatorStub implements BillsProvider {
  readonly name = 'stub';
  private readonly logger = new Logger(BillsAggregatorStub.name);

  supportsCurrency(currency: string): boolean {
    return currency === 'NGN';
  }

  async listCategories(): Promise<BillCategoryDefinition[]> {
    return [
      {
        id: 'airtime',
        name: 'Airtime',
        billers: [
          {
            id: 'mtn-airtime',
            name: 'MTN Airtime',
            category: 'airtime',
            requiresValidation: false,
            validationFields: ['phone_number'],
            amountType: 'variable',
            aggregator: this.name
          },
          {
            id: 'airtel-airtime',
            name: 'Airtel Airtime',
            category: 'airtime',
            requiresValidation: false,
            validationFields: ['phone_number'],
            amountType: 'variable',
            aggregator: this.name
          }
        ]
      },
      {
        id: 'data',
        name: 'Data',
        billers: [
          {
            id: 'mtn-data-1gb',
            name: 'MTN Data 1GB',
            category: 'data',
            requiresValidation: false,
            validationFields: ['phone_number'],
            amountType: 'fixed',
            amountMinor: 100000,
            aggregator: this.name
          },
          {
            id: 'glo-data-2gb',
            name: 'Glo Data 2GB',
            category: 'data',
            requiresValidation: false,
            validationFields: ['phone_number'],
            amountType: 'fixed',
            amountMinor: 150000,
            aggregator: this.name
          }
        ]
      },
      {
        id: 'electricity',
        name: 'Electricity',
        billers: [
          {
            id: 'ekedc-prepaid',
            name: 'EKEDC Prepaid',
            category: 'electricity',
            requiresValidation: true,
            validationFields: ['meter_number'],
            amountType: 'variable',
            aggregator: this.name
          },
          {
            id: 'ikedc-postpaid',
            name: 'IKEDC Postpaid',
            category: 'electricity',
            requiresValidation: true,
            validationFields: ['account_number'],
            amountType: 'variable',
            aggregator: this.name
          }
        ]
      },
      {
        id: 'cable_tv',
        name: 'Cable TV',
        billers: [
          {
            id: 'dstv',
            name: 'DSTV',
            category: 'cable_tv',
            requiresValidation: true,
            validationFields: ['smartcard_number'],
            amountType: 'variable',
            aggregator: this.name
          },
          {
            id: 'gotv',
            name: 'GOtv',
            category: 'cable_tv',
            requiresValidation: true,
            validationFields: ['smartcard_number'],
            amountType: 'variable',
            aggregator: this.name
          }
        ]
      },
      {
        id: 'internet',
        name: 'Internet',
        billers: [
          {
            id: 'spectranet',
            name: 'Spectranet',
            category: 'internet',
            requiresValidation: true,
            validationFields: ['customer_id'],
            amountType: 'variable',
            aggregator: this.name
          }
        ]
      },
      {
        id: 'betting',
        name: 'Betting',
        billers: [
          {
            id: 'bet9ja',
            name: 'Bet9ja',
            category: 'betting',
            requiresValidation: false,
            validationFields: ['customer_id'],
            amountType: 'variable',
            aggregator: this.name
          }
        ]
      }
    ];
  }

  async validate(payload: {
    billerId: string;
    fields: Record<string, string>;
    reference: string;
  }): Promise<BillValidationResult> {
    const customerRef =
      payload.fields.meter_number ??
      payload.fields.account_number ??
      payload.fields.smartcard_number ??
      payload.fields.phone_number ??
      payload.fields.customer_id ??
      '';

    if (!/^[0-9A-Za-z]{5,}$/.test(customerRef)) {
      throw new Error('Invalid meter/account number');
    }

    const minimumAmountMinor = payload.billerId.includes('prepaid') ? '100000' : '0';
    return {
      customerName: 'OKOYE CHINEDU',
      customerAddress: '12 Allen Avenue, Ikeja',
      customerRef,
      outstandingBalanceMinor: '0',
      minimumAmountMinor,
      validUntil: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      metadata: {
        stub: true,
        reference: payload.reference
      }
    };
  }

  async purchase(payload: {
    productCode: string;
    beneficiary: string;
    amountMinor: string;
    currency: string;
    reference: string;
    validationRef?: string;
    customerName?: string;
    customerRef?: string;
  }) {
    this.logger.warn(`[BILLS STUB] Purchasing ${payload.productCode} for ${payload.beneficiary}`);
    const isElectricity = payload.productCode.includes('prepaid') || payload.productCode.includes('postpaid');
    return {
      status: 'SUCCESS' as const,
      providerReference: `STUB-BILL-${Date.now()}`,
      billerReference: `STUB-BILLER-${Date.now()}`,
      token: isElectricity ? '1234-5678-9012-3456-7890' : undefined,
      units: isElectricity
        ? `${(Number(payload.amountMinor) / 10000).toFixed(1)} kWh`
        : undefined,
      metadata: { stub: true }
    };
  }

  async payNqr(payload: {
    qrData: string;
    amountMinor: string;
    currency: string;
    reference: string;
  }) {
    return {
      status: 'SUCCESS' as const,
      providerReference: `STUB-NQR-${Date.now()}`,
      sessionId: this.generateSessionId(),
      merchantName: this.extractMerchant(payload.qrData),
      metadata: { stub: true }
    };
  }

  private extractMerchant(qrData: string) {
    const trimmed = qrData.trim();
    if (trimmed.length <= 16) return 'NQR MERCHANT';
    return `MERCHANT ${trimmed.slice(0, 10).toUpperCase()}`;
  }

  private generateSessionId() {
    const d = new Date();
    const y = d.getUTCFullYear().toString().slice(-2);
    const m = `${d.getUTCMonth() + 1}`.padStart(2, '0');
    const day = `${d.getUTCDate()}`.padStart(2, '0');
    const h = `${d.getUTCHours()}`.padStart(2, '0');
    const min = `${d.getUTCMinutes()}`.padStart(2, '0');
    const sec = `${d.getUTCSeconds()}`.padStart(2, '0');
    const suffix = Math.floor(Math.random() * 1_000_000)
      .toString()
      .padStart(6, '0');
    return `000015${y}${m}${day}${h}${min}${sec}${suffix}`;
  }
}

