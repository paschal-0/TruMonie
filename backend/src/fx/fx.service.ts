import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';

import { Currency } from '../ledger/enums/currency.enum';
import { LedgerService } from '../ledger/ledger.service';
import { AccountsService } from '../ledger/accounts.service';
import { EntryDirection } from '../ledger/enums/entry-direction.enum';
import { REDIS_CLIENT } from '../redis/redis.module';
import { FxProvider } from './interfaces/fx-provider.interface';
import { FX_PROVIDER } from './fx.constants';

interface Quote {
  id: string;
  base: Currency;
  quote: Currency;
  amountMinor: string;
  rate: number;
  spreadBps: number;
}

interface RedisClient {
  setex(key: string, ttl: number, value: string): Promise<void>;
  get(key: string): Promise<string | null>;
}

@Injectable()
export class FxService {
  constructor(
    private readonly ledgerService: LedgerService,
    private readonly accountsService: AccountsService,
    private readonly configService: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redisClient: RedisClient,
    @Inject(FX_PROVIDER) private readonly fxProvider: FxProvider
  ) {}

  async getRate(base: Currency, quote: Currency) {
    return this.fxProvider.getRate(base, quote);
  }

  async createQuote(base: Currency, quote: Currency, amountMinor: string) {
    const rate = await this.getRate(base, quote);
    if (!rate) throw new BadRequestException('Rate not available');
    const spreadBps = 50; // 0.5% spread
    const finalRate = rate * (1 - spreadBps / 10000);
    const id = uuidv4();
    const quoteObj: Quote = { id, base, quote, amountMinor, rate: finalRate, spreadBps };
    await this.redisClient.setex(`fx:quote:${id}`, 30, JSON.stringify(quoteObj));
    return quoteObj;
  }

  async convert(userId: string, quoteId: string, base: Currency, quote: Currency, amountMinor: string) {
    const cached = await this.redisClient.get(`fx:quote:${quoteId}`);
    if (!cached) throw new BadRequestException('Quote expired');
    const quoteObj = JSON.parse(cached) as Quote;
    if (quoteObj.base !== base || quoteObj.quote !== quote || quoteObj.amountMinor !== amountMinor) {
      throw new BadRequestException('Quote mismatch');
    }
    const accounts = await this.accountsService.getUserAccounts(userId);
    const baseWallet = accounts.find((a) => a.currency === base);
    const quoteWallet = accounts.find((a) => a.currency === quote);
    if (!baseWallet || !quoteWallet) throw new BadRequestException('Wallets not found');
    const baseTreasury = this.getTreasuryAccount(base);
    const quoteTreasury = this.getTreasuryAccount(quote);
    const convertedMinor = (BigInt(amountMinor) * BigInt(Math.round(quoteObj.rate * 1_000_000))) / 1_000_000n;

    return this.ledgerService.postEntry({
      reference: `FX-${quoteId}`,
      idempotencyKey: `FX-${quoteId}`,
      description: `FX convert ${base} to ${quote}`,
      enforceNonNegative: true,
      lines: [
        {
          accountId: baseWallet.id,
          direction: EntryDirection.DEBIT,
          amountMinor: amountMinor,
          currency: base
        },
        {
          accountId: baseTreasury,
          direction: EntryDirection.CREDIT,
          amountMinor: amountMinor,
          currency: base
        },
        {
          accountId: quoteTreasury,
          direction: EntryDirection.DEBIT,
          amountMinor: convertedMinor.toString(),
          currency: quote
        },
        {
          accountId: quoteWallet.id,
          direction: EntryDirection.CREDIT,
          amountMinor: convertedMinor.toString(),
          currency: quote
        }
      ]
    });
  }

  private getTreasuryAccount(currency: Currency): string {
    const treasury = this.configService.get<Record<string, string | undefined>>('systemAccounts.treasury');
    const accountId = treasury?.[currency];
    if (!accountId) {
      throw new BadRequestException(`Treasury account not configured for ${currency}`);
    }
    return accountId;
  }
}
