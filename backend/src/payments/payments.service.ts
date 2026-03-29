import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AccountsPolicy } from '../ledger/accounts.policy';
import { AccountsService } from '../ledger/accounts.service';
import { LedgerService } from '../ledger/ledger.service';
import { Currency } from '../ledger/enums/currency.enum';
import { EntryDirection } from '../ledger/enums/entry-direction.enum';
import { PaymentProvider } from './interfaces/payment-provider.interface';
import { FundingStatus, FundingTransaction } from './entities/funding-transaction.entity';
import { Payout, PayoutStatus } from './entities/payout.entity';
import { WebhookEvent } from './entities/webhook-event.entity';
import { PAYMENT_PROVIDERS } from './payments.constants';

@Injectable()
export class PaymentsService {
  private readonly providers: Record<string, PaymentProvider>;

  constructor(
    private readonly ledgerService: LedgerService,
    private readonly accountsService: AccountsService,
    private readonly accountsPolicy: AccountsPolicy,
    private readonly configService: ConfigService,
    @InjectRepository(FundingTransaction)
    private readonly fundingRepo: Repository<FundingTransaction>,
    @InjectRepository(Payout)
    private readonly payoutRepo: Repository<Payout>,
    @InjectRepository(WebhookEvent)
    private readonly webhookRepo: Repository<WebhookEvent>,
    @Inject(PAYMENT_PROVIDERS) providers: PaymentProvider[]
  ) {
    this.providers = providers.reduce<Record<string, PaymentProvider>>((acc, provider) => {
      acc[provider.name] = provider;
      return acc;
    }, {});
  }

  async creditWalletFromWebhook(providerName: string, body: unknown, signature?: string) {
    const provider = this.resolveProvider(providerName);
    const payload = JSON.stringify(body);
    if (!provider.verifyWebhookSignature(payload, signature || '')) {
      throw new UnauthorizedException('Invalid signature');
    }

    const parsed = provider.parseFundingWebhook(body);
    this.assertProviderSupportsCurrency(provider, parsed.currency);
    const ledgerEntry = await this.creditWallet({
      userId: parsed.userId,
      amountMinor: parsed.amountMinor,
      currency: parsed.currency,
      reference: parsed.reference,
      idempotencyKey: parsed.idempotencyKey,
      description: 'Wallet funding',
      provider: provider.name,
      metadata: parsed
    });
    await this.storeWebhook(provider.name, parsed.reference, body);
    return ledgerEntry;
  }

  async initiatePayout(
    providerName: string,
    userId: string,
    sourceAccountId: string,
    amountMinor: string,
    currency: Currency,
    destination: { bankCode: string; accountNumber: string; accountName?: string },
    narration?: string
  ) {
    const provider = this.resolveProvider(providerName);
    this.assertProviderSupportsCurrency(provider, currency);
    await this.accountsPolicy.assertOwnership(userId, sourceAccountId);
    const settlementAccountId = this.getSettlementAccount(provider.name, currency);

    const ledgerEntry = await this.ledgerService.postEntry({
      reference: `PAYOUT-${Date.now()}`,
      description: narration ?? 'Payout',
      enforceNonNegative: true,
      lines: [
        {
          accountId: sourceAccountId,
          direction: EntryDirection.DEBIT,
          amountMinor,
          currency
        },
        {
          accountId: settlementAccountId,
          direction: EntryDirection.CREDIT,
          amountMinor,
          currency
        }
      ]
    });

    const providerRes = await provider.initiatePayout(
      userId,
      amountMinor,
      currency,
      destination,
      narration
    );

    await this.payoutRepo.save(
      this.payoutRepo.create({
        userId,
        sourceAccountId,
        amountMinor,
        currency,
        provider: provider.name,
        providerReference: providerRes.providerReference,
        status:
          providerRes.status === 'SUCCESS'
            ? PayoutStatus.SUCCESS
            : providerRes.status === 'FAILED'
            ? PayoutStatus.FAILED
            : PayoutStatus.PENDING,
        metadata: { destination, narration, ledgerEntryId: ledgerEntry.id }
      })
    );

    return providerRes;
  }

  async resolveBankAccount(bankCode: string, accountNumber: string, providerName?: string) {
    const provider = this.resolveProvider(providerName);
    if (provider.resolveBankAccount) {
      return provider.resolveBankAccount(bankCode, accountNumber);
    }
    return { bankCode, accountNumber, accountName: 'Stubbed Name' };
  }

  async creditWallet(params: {
    userId: string;
    amountMinor: string;
    currency: Currency;
    reference: string;
    idempotencyKey?: string;
    description?: string;
    provider?: string;
    metadata?: Record<string, unknown>;
  }) {
    const providerName = params.provider ?? this.getDefaultProviderName();
    const provider = this.resolveProvider(providerName);
    this.assertProviderSupportsCurrency(provider, params.currency);

    const accounts = await this.accountsService.getUserAccounts(params.userId);
    const wallet = accounts.find((a) => a.currency === params.currency);
    if (!wallet) {
      throw new NotFoundException('Wallet not found for user');
    }

    const settlementAccountId = this.getSettlementAccount(provider.name, params.currency);
    const ledgerEntry = await this.ledgerService.postEntry({
      reference: params.reference,
      idempotencyKey: params.idempotencyKey ?? params.reference,
      description: params.description ?? 'Wallet funding',
      enforceNonNegative: false,
      lines: [
        {
          accountId: settlementAccountId,
          direction: EntryDirection.DEBIT,
          amountMinor: params.amountMinor,
          currency: params.currency
        },
        {
          accountId: wallet.id,
          direction: EntryDirection.CREDIT,
          amountMinor: params.amountMinor,
          currency: params.currency
        }
      ]
    });

    await this.recordFunding({
      userId: params.userId,
      destinationAccountId: wallet.id,
      amountMinor: params.amountMinor,
      currency: params.currency,
      provider: provider.name,
      reference: params.reference,
      metadata: params.metadata
    });

    return ledgerEntry;
  }

  getDefaultProviderName(): string {
    return this.configService.get<string>('integrations.defaultPaymentProvider', 'licensed');
  }

  getProvider(name: string): PaymentProvider | undefined {
    return this.providers[name];
  }

  private resolveProvider(providerName?: string): PaymentProvider {
    const resolvedName = providerName ?? this.getDefaultProviderName();
    const provider = this.providers[resolvedName];
    if (!provider) {
      const supported = Object.keys(this.providers).join(', ');
      throw new BadRequestException(
        `Unsupported provider "${resolvedName}". Supported providers: ${supported}`
      );
    }
    return provider;
  }

  private assertProviderSupportsCurrency(provider: PaymentProvider, currency: Currency) {
    if (provider.supportsCurrency && !provider.supportsCurrency(currency)) {
      throw new BadRequestException(`${provider.name} does not support ${currency}`);
    }
  }

  private getSettlementAccount(providerName: string, currency: Currency): string {
    const settlement = this.configService.get<
      Record<string, Partial<Record<Currency, string | undefined>> | undefined>
    >('systemAccounts.settlement');
    const providerAccount = settlement?.[providerName]?.[currency];
    if (providerAccount) {
      return providerAccount;
    }
    return this.getTreasuryAccount(currency);
  }

  private getTreasuryAccount(currency: Currency): string {
    const treasury = this.configService.get<Record<string, string | undefined>>('systemAccounts.treasury');
    const accountId = treasury?.[currency];
    if (!accountId) {
      throw new BadRequestException(`Treasury account not configured for ${currency}`);
    }
    return accountId;
  }

  private async recordFunding(params: {
    userId: string;
    destinationAccountId: string;
    amountMinor: string;
    currency: Currency;
    provider: string;
    reference: string;
    metadata?: Record<string, unknown>;
  }) {
    const existing = await this.fundingRepo.findOne({ where: { reference: params.reference } });
    if (existing) {
      return existing;
    }
    return this.fundingRepo.save(
      this.fundingRepo.create({
        userId: params.userId,
        destinationAccountId: params.destinationAccountId,
        amountMinor: params.amountMinor,
        currency: params.currency,
        provider: params.provider,
        reference: params.reference,
        status: FundingStatus.SUCCESS,
        metadata: params.metadata ?? null
      })
    );
  }

  private async storeWebhook(provider: string, idempotencyKey: string, payload: unknown) {
    const normalizedPayload =
      typeof payload === 'object' && payload !== null
        ? (payload as Record<string, unknown>)
        : { value: payload };
    await this.webhookRepo.save(
      this.webhookRepo.create({
        provider,
        eventType: 'funding',
        idempotencyKey,
        payload: normalizedPayload
      })
    );
  }
}
