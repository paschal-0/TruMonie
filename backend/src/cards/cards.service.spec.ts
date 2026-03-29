import { Currency } from '../ledger/enums/currency.enum';
import { CardStatus } from './entities/card.entity';
import { CardsService } from './cards.service';

describe('CardsService', () => {
  it('creates card with configured default provider', async () => {
    const cardRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((payload: unknown) => payload),
      save: jest.fn().mockImplementation(async (payload: unknown) => payload)
    };
    const accountsService = {
      findById: jest.fn().mockResolvedValue({
        id: 'acct-1',
        userId: 'user-1',
        currency: Currency.USD
      })
    };
    const configService = {
      get: jest.fn().mockReturnValue('licensed')
    };
    const licensedProvider = {
      name: 'licensed',
      supportsCurrency: jest.fn().mockReturnValue(true),
      createCard: jest.fn().mockResolvedValue({
        providerReference: 'card-ref-1',
        last4: '4321'
      }),
      blockCard: jest.fn(),
      unblockCard: jest.fn()
    };

    const service = new CardsService(
      cardRepo as unknown as ConstructorParameters<typeof CardsService>[0],
      accountsService as unknown as ConstructorParameters<typeof CardsService>[1],
      configService as unknown as ConstructorParameters<typeof CardsService>[2],
      [licensedProvider] as unknown as ConstructorParameters<typeof CardsService>[3]
    );

    const card = await service.create('user-1', {
      fundingAccountId: 'acct-1',
      currency: Currency.USD
    });

    expect(licensedProvider.createCard).toHaveBeenCalled();
    expect(card.provider).toBe('licensed');
    expect(card.last4).toBe('4321');
  });

  it('blocks card using stored provider', async () => {
    const cardRepo = {
      find: jest.fn(),
      findOne: jest.fn().mockResolvedValue({
        id: 'card-1',
        userId: 'user-1',
        provider: 'licensed',
        providerReference: 'card-ref-1',
        status: CardStatus.ACTIVE
      }),
      create: jest.fn(),
      save: jest.fn().mockImplementation(async (payload: unknown) => payload)
    };
    const accountsService = {
      findById: jest.fn()
    };
    const configService = {
      get: jest.fn().mockReturnValue('licensed')
    };
    const licensedProvider = {
      name: 'licensed',
      supportsCurrency: jest.fn().mockReturnValue(true),
      createCard: jest.fn(),
      blockCard: jest.fn().mockResolvedValue(undefined),
      unblockCard: jest.fn().mockResolvedValue(undefined)
    };

    const service = new CardsService(
      cardRepo as unknown as ConstructorParameters<typeof CardsService>[0],
      accountsService as unknown as ConstructorParameters<typeof CardsService>[1],
      configService as unknown as ConstructorParameters<typeof CardsService>[2],
      [licensedProvider] as unknown as ConstructorParameters<typeof CardsService>[3]
    );

    const card = await service.block('user-1', 'card-1');

    expect(licensedProvider.blockCard).toHaveBeenCalledWith({ providerReference: 'card-ref-1' });
    expect(card.status).toBe(CardStatus.BLOCKED);
  });
});
