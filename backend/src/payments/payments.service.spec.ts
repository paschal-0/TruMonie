import { BadRequestException } from '@nestjs/common';

import { Currency } from '../ledger/enums/currency.enum';
import { EntryDirection } from '../ledger/enums/entry-direction.enum';
import { PaymentsService } from './payments.service';
import { PaymentProvider } from './interfaces/payment-provider.interface';

describe('PaymentsService', () => {
  const baseConfig = {
    integrations: {
      defaultPaymentProvider: 'licensed'
    },
    systemAccounts: {
      treasury: {
        [Currency.NGN]: 'treasury-ngn',
        [Currency.USD]: 'treasury-usd'
      },
      settlement: {
        licensed: {
          [Currency.NGN]: 'settlement-licensed-ngn',
          [Currency.USD]: 'settlement-licensed-usd'
        }
      }
    }
  };

  const makeService = (providers: PaymentProvider[]) => {
    const ledgerService = {
      postEntry: jest.fn().mockResolvedValue({ id: 'ledger-1' })
    };
    const accountsService = {
      getUserAccounts: jest.fn().mockResolvedValue([{ id: 'wallet-1', currency: Currency.USD }])
    };
    const accountsPolicy = {
      assertOwnership: jest.fn().mockResolvedValue(undefined)
    };
    const circuitBreakerService = {
      assertWithinNewDeviceCap: jest.fn().mockResolvedValue(undefined)
    };
    const limitsService = {
      assertWithinMaxBalance: jest.fn()
    };
    const usersService = {
      findById: jest.fn().mockResolvedValue({ id: 'user-1', limitTier: 'TIER2' })
    };
    const configService = {
      get: jest.fn((key: string, fallback?: unknown) => {
        const parts = key.split('.');
        let cursor: unknown = baseConfig;
        for (const part of parts) {
          cursor =
            typeof cursor === 'object' && cursor !== null
              ? (cursor as Record<string, unknown>)[part]
              : undefined;
        }
        return cursor ?? fallback;
      })
    };
    const fundingRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((payload: unknown) => payload),
      save: jest.fn((payload: unknown) => Promise.resolve(payload))
    };
    const payoutRepo = {
      create: jest.fn((payload: unknown) => payload),
      save: jest.fn((payload: unknown) => Promise.resolve(payload))
    };
    const webhookRepo = {
      create: jest.fn((payload: unknown) => payload),
      save: jest.fn((payload: unknown) => Promise.resolve(payload))
    };

    const service = new PaymentsService(
      ledgerService as unknown as ConstructorParameters<typeof PaymentsService>[0],
      accountsService as unknown as ConstructorParameters<typeof PaymentsService>[1],
      accountsPolicy as unknown as ConstructorParameters<typeof PaymentsService>[2],
      circuitBreakerService as unknown as ConstructorParameters<typeof PaymentsService>[3],
      limitsService as unknown as ConstructorParameters<typeof PaymentsService>[4],
      usersService as unknown as ConstructorParameters<typeof PaymentsService>[5],
      configService as unknown as ConstructorParameters<typeof PaymentsService>[6],
      fundingRepo as unknown as ConstructorParameters<typeof PaymentsService>[7],
      payoutRepo as unknown as ConstructorParameters<typeof PaymentsService>[8],
      webhookRepo as unknown as ConstructorParameters<typeof PaymentsService>[9],
      providers
    );

    return {
      service,
      ledgerService,
      accountsPolicy
    };
  };

  it('routes payout ledger credit to provider settlement account', async () => {
    const licensedProvider: PaymentProvider = {
      name: 'licensed',
      supportsCurrency: () => true,
      createVirtualAccount: jest.fn(),
      initiatePayout: jest.fn().mockResolvedValue({
        providerReference: 'out-1',
        status: 'SUCCESS'
      }),
      verifyWebhookSignature: jest.fn().mockReturnValue(true),
      parseFundingWebhook: jest.fn()
    };
    const { service, ledgerService } = makeService([licensedProvider]);

    await service.initiatePayout(
      'licensed',
      'user-1',
      'wallet-1',
      '1000',
      Currency.USD,
      { bankCode: '001', accountNumber: '1234567890' }
    );

    expect(ledgerService.postEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        lines: expect.arrayContaining([
          expect.objectContaining({
            accountId: 'wallet-1',
            direction: EntryDirection.DEBIT
          }),
          expect.objectContaining({
            accountId: 'settlement-licensed-usd',
            direction: EntryDirection.CREDIT
          })
        ])
      })
    );
  });

  it('throws for unsupported provider', async () => {
    const { service } = makeService([]);
    await expect(
      service.initiatePayout(
        'missing',
        'user-1',
        'wallet-1',
        '1000',
        Currency.NGN,
        { bankCode: '001', accountNumber: '1234567890' }
      )
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
