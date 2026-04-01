import {
  BadRequestException,
  HttpStatus,
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
import { VirtualAccount } from '../ledger/entities/virtual-account.entity';
import { WalletTransactionStatus } from '../ledger/entities/wallet-transaction.entity';
import { LedgerService } from '../ledger/ledger.service';
import { Currency } from '../ledger/enums/currency.enum';
import { EntryDirection } from '../ledger/enums/entry-direction.enum';
import { WalletErrorCode, WalletException } from '../ledger/wallet.errors';
import { PaymentProvider } from './interfaces/payment-provider.interface';
import { FundingStatus, FundingTransaction } from './entities/funding-transaction.entity';
import { Payout, PayoutStatus } from './entities/payout.entity';
import { WebhookEvent } from './entities/webhook-event.entity';
import { PAYMENT_PROVIDERS } from './payments.constants';
import { CircuitBreakerService } from '../risk/circuit-breaker.service';
import { LimitsService } from '../limits/limits.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class PaymentsService {
  private readonly providers: Record<string, PaymentProvider>;

  constructor(
    private readonly ledgerService: LedgerService,
    private readonly accountsService: AccountsService,
    private readonly accountsPolicy: AccountsPolicy,
    private readonly circuitBreakerService: CircuitBreakerService,
    private readonly limitsService: LimitsService,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
    @InjectRepository(FundingTransaction)
    private readonly fundingRepo: Repository<FundingTransaction>,
    @InjectRepository(Payout)
    private readonly payoutRepo: Repository<Payout>,
    @InjectRepository(WebhookEvent)
    private readonly webhookRepo: Repository<WebhookEvent>,
    @InjectRepository(VirtualAccount)
    private readonly virtualAccountRepo: Repository<VirtualAccount>,
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
    await this.circuitBreakerService.assertWithinNewDeviceCap(userId, amountMinor);
    const settlementAccountId = this.getSettlementAccount(provider.name, currency);

    const ledgerEntry = await this.ledgerService.postEntry({
      reference: `PAYOUT-${Date.now()}`,
      description: narration ?? 'Payout',
      enforceNonNegative: true,
      metadata: {
        category: 'PAYOUT',
        channel: 'BANK_TRANSFER',
        status: 'PENDING'
      },
      lines: [
        {
          accountId: sourceAccountId,
          direction: EntryDirection.DEBIT,
          amountMinor,
          currency,
          category: 'PAYOUT',
          channel: 'BANK_TRANSFER',
          status: WalletTransactionStatus.PENDING
        },
        {
          accountId: settlementAccountId,
          direction: EntryDirection.CREDIT,
          amountMinor,
          currency,
          category: 'PAYOUT',
          channel: 'BANK_TRANSFER',
          status: WalletTransactionStatus.PENDING
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

  async createVirtualAccount(params: {
    userId: string;
    walletId: string;
    currency: string;
    providerName?: string;
  }) {
    const provider = this.resolveProvider(params.providerName);
    const normalizedCurrency = params.currency.toUpperCase();
    if (!['NGN', 'USD', 'EUR', 'GBP'].includes(normalizedCurrency)) {
      throw new BadRequestException('currency must be NGN, USD, EUR, or GBP');
    }
    const wallet = await this.accountsService.findById(params.walletId);
    if (!wallet || wallet.userId !== params.userId) {
      throw new WalletException(
        WalletErrorCode.WALLET_NOT_FOUND,
        'Wallet not found',
        HttpStatus.NOT_FOUND
      );
    }
    if (normalizedCurrency !== wallet.currency && !['EUR', 'GBP'].includes(normalizedCurrency)) {
      throw new BadRequestException(
        `Requested currency ${normalizedCurrency} is not supported by this wallet`
      );
    }
    const existing = await this.virtualAccountRepo.findOne({
      where: {
        walletId: params.walletId,
        currency: normalizedCurrency,
        provider: provider.name,
        status: 'ACTIVE'
      },
      order: { createdAt: 'DESC' }
    });
    if (existing) {
      return existing;
    }

    const user = await this.usersService.findById(params.userId);
    if (!user) {
      throw new NotFoundException('User not found for virtual account issuance');
    }
    const accountName = `${user.firstName} ${user.lastName}`.trim().toUpperCase();
    const providerRes = await provider.createVirtualAccount({
      userId: params.userId,
      currency: normalizedCurrency,
      accountName
    });

    const created = await this.virtualAccountRepo.save(
      this.virtualAccountRepo.create({
        walletId: params.walletId,
        userId: params.userId,
        accountNumber: providerRes.accountNumber,
        accountName: providerRes.accountName ?? accountName,
        bankName: providerRes.bankName,
        bankCode: providerRes.bankCode ?? '000',
        currency: normalizedCurrency,
        provider: provider.name,
        status: 'ACTIVE'
      })
    );

    return created;
  }

  async fundWallet(params: {
    userId: string;
    walletId: string;
    amountMinor: string;
    currency: Currency;
    channel: 'BANK_TRANSFER' | 'CARD' | 'USSD' | 'VIRTUAL_ACCOUNT';
    cardToken?: string;
    idempotencyKey?: string;
    providerName?: string;
  }) {
    const provider = this.resolveProvider(params.providerName);
    this.assertProviderSupportsCurrency(provider, params.currency);
    await this.accountsPolicy.assertOwnership(params.userId, params.walletId);

    if (params.channel === 'CARD' && !params.cardToken) {
      throw new BadRequestException('cardToken is required for CARD funding');
    }

    const wallet = await this.accountsService.findById(params.walletId);
    if (!wallet || wallet.userId !== params.userId) {
      throw new WalletException(
        WalletErrorCode.WALLET_NOT_FOUND,
        'Wallet not found',
        HttpStatus.NOT_FOUND
      );
    }

    const user = await this.usersService.findById(params.userId);
    if (!user) {
      throw new NotFoundException('User not found for funding');
    }
    this.limitsService.assertWithinMaxBalance(user.limitTier, wallet.balanceMinor, params.amountMinor);
    await this.circuitBreakerService.assertWithinNewDeviceCap(params.userId, params.amountMinor);

    const reference = `FND-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const ledgerEntry = await this.ledgerService.postEntry({
      reference,
      idempotencyKey: params.idempotencyKey ?? reference,
      description: `Wallet funding via ${params.channel}`,
      enforceNonNegative: false,
      metadata: {
        category: 'FUNDING',
        channel: params.channel,
        status: 'SUCCESS'
      },
      lines: [
        {
          accountId: this.getSettlementAccount(provider.name, params.currency),
          direction: EntryDirection.DEBIT,
          amountMinor: params.amountMinor,
          currency: params.currency,
          memo: `Funding settlement (${params.channel})`,
          category: 'FUNDING',
          channel: params.channel,
          status: WalletTransactionStatus.SUCCESS
        },
        {
          accountId: wallet.id,
          direction: EntryDirection.CREDIT,
          amountMinor: params.amountMinor,
          currency: params.currency,
          memo: `Wallet funded via ${params.channel}`,
          category: 'FUNDING',
          channel: params.channel,
          status: WalletTransactionStatus.SUCCESS
        }
      ]
    });

    await this.recordFunding({
      userId: params.userId,
      destinationAccountId: wallet.id,
      amountMinor: params.amountMinor,
      currency: params.currency,
      provider: provider.name,
      reference,
      metadata: {
        channel: params.channel,
        cardToken: params.cardToken ?? null
      }
    });

    const refreshedWallet = await this.accountsService.findById(wallet.id);

    return {
      transaction_id: ledgerEntry.id,
      reference,
      amount: Number(params.amountMinor),
      status: 'SUCCESS',
      new_balance: Number(refreshedWallet?.balanceMinor ?? wallet.balanceMinor)
    };
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

    const wallet = await this.accountsService.findWalletByUserAndCurrency(params.userId, params.currency);
    if (!wallet) {
      throw new WalletException(
        WalletErrorCode.WALLET_NOT_FOUND,
        'Wallet not found for user',
        HttpStatus.NOT_FOUND
      );
    }

    const user = await this.usersService.findById(params.userId);
    if (!user) {
      throw new NotFoundException('User not found for funding');
    }
    this.limitsService.assertWithinMaxBalance(user.limitTier, wallet.balanceMinor, params.amountMinor);
    await this.circuitBreakerService.assertWithinNewDeviceCap(params.userId, params.amountMinor);

    const settlementAccountId = this.getSettlementAccount(provider.name, params.currency);
    const ledgerEntry = await this.ledgerService.postEntry({
      reference: params.reference,
      idempotencyKey: params.idempotencyKey ?? params.reference,
      description: params.description ?? 'Wallet funding',
      enforceNonNegative: false,
      metadata: {
        category: 'FUNDING',
        channel: 'WEBHOOK',
        status: 'SUCCESS'
      },
      lines: [
        {
          accountId: settlementAccountId,
          direction: EntryDirection.DEBIT,
          amountMinor: params.amountMinor,
          currency: params.currency,
          category: 'FUNDING',
          channel: 'WEBHOOK',
          status: WalletTransactionStatus.SUCCESS
        },
        {
          accountId: wallet.id,
          direction: EntryDirection.CREDIT,
          amountMinor: params.amountMinor,
          currency: params.currency,
          category: 'FUNDING',
          channel: 'WEBHOOK',
          status: WalletTransactionStatus.SUCCESS
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
