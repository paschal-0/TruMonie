import { Currency } from '../ledger/enums/currency.enum';
import { FxService } from './fx.service';

describe('FxService', () => {
  it('delegates rate lookup to configured provider', async () => {
    const ledgerService = {
      postEntry: jest.fn()
    };
    const accountsService = {
      getUserAccounts: jest.fn()
    };
    const redisClient = {
      setex: jest.fn(),
      get: jest.fn()
    };
    const configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'systemAccounts.treasury') {
          return {
            [Currency.NGN]: 'treasury-ngn',
            [Currency.USD]: 'treasury-usd'
          };
        }
        return undefined;
      })
    };
    const fxProvider = {
      getRate: jest.fn().mockResolvedValue(1500)
    };

    const service = new FxService(
      ledgerService as unknown as ConstructorParameters<typeof FxService>[0],
      accountsService as unknown as ConstructorParameters<typeof FxService>[1],
      configService as unknown as ConstructorParameters<typeof FxService>[2],
      redisClient as unknown as ConstructorParameters<typeof FxService>[3],
      fxProvider as unknown as ConstructorParameters<typeof FxService>[4]
    );

    const rate = await service.getRate(Currency.USD, Currency.NGN);
    expect(rate).toBe(1500);
    expect(fxProvider.getRate).toHaveBeenCalledWith(Currency.USD, Currency.NGN);
  });

  it('creates quote and caches it in redis', async () => {
    const ledgerService = {
      postEntry: jest.fn()
    };
    const accountsService = {
      getUserAccounts: jest.fn()
    };
    const redisClient = {
      setex: jest.fn().mockResolvedValue(undefined),
      get: jest.fn()
    };
    const configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'systemAccounts.treasury') {
          return {
            [Currency.NGN]: 'treasury-ngn',
            [Currency.USD]: 'treasury-usd'
          };
        }
        return undefined;
      })
    };
    const fxProvider = {
      getRate: jest.fn().mockResolvedValue(1500)
    };

    const service = new FxService(
      ledgerService as unknown as ConstructorParameters<typeof FxService>[0],
      accountsService as unknown as ConstructorParameters<typeof FxService>[1],
      configService as unknown as ConstructorParameters<typeof FxService>[2],
      redisClient as unknown as ConstructorParameters<typeof FxService>[3],
      fxProvider as unknown as ConstructorParameters<typeof FxService>[4]
    );

    const quote = await service.createQuote(Currency.USD, Currency.NGN, '1000');
    expect(quote.rate).toBeGreaterThan(0);
    expect(redisClient.setex).toHaveBeenCalledWith(
      expect.stringContaining('fx:quote:'),
      30,
      expect.any(String)
    );
  });
});
