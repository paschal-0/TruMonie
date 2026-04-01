import {
  BadRequestException,
  HttpStatus,
  Injectable,
  Logger
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomInt } from 'crypto';
import { Repository } from 'typeorm';

import { LIMIT_PROFILES } from '../limits/limit-profiles';
import { LimitTier, User } from '../users/entities/user.entity';
import { Account } from './entities/account.entity';
import { JournalLine } from './entities/journal-line.entity';
import { WalletTransaction } from './entities/wallet-transaction.entity';
import { AccountStatus } from './enums/account-status.enum';
import { AccountType } from './enums/account-type.enum';
import { Currency } from './enums/currency.enum';
import { WalletErrorCode, WalletException } from './wallet.errors';
import { WalletEventsService } from './wallet-events.service';

export type AccountNumberSource = 'PHONE' | 'SYSTEM';

interface EnsureBaseAccountsOptions {
  accountNumberSource?: AccountNumberSource;
  phoneNumber?: string;
}

export interface WalletTransactionsQuery {
  startDate?: string;
  endDate?: string;
  category?: string;
  status?: string;
  type?: string;
  minAmountMinor?: string;
  maxAmountMinor?: string;
  page?: number;
  perPage?: number;
}

@Injectable()
export class AccountsService {
  private readonly logger = new Logger(AccountsService.name);

  constructor(
    @InjectRepository(Account) private readonly accountRepo: Repository<Account>,
    @InjectRepository(JournalLine) private readonly lineRepo: Repository<JournalLine>,
    @InjectRepository(WalletTransaction)
    private readonly walletTxRepo: Repository<WalletTransaction>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly configService: ConfigService,
    private readonly walletEventsService: WalletEventsService
  ) {}

  async ensureUserBaseAccounts(userId: string, options: EnsureBaseAccountsOptions = {}): Promise<void> {
    const provisioning = await this.resolveProvisioningContext(userId, options);
    const existing = await this.accountRepo.find({
      where: { userId, type: AccountType.WALLET_MAIN }
    });
    const existingCurrencies = new Set(existing.map((a) => a.currency));
    const targets = [Currency.NGN, Currency.USD];

    const ngnExisting = existing.find((a) => a.currency === Currency.NGN);
    if (ngnExisting && !ngnExisting.accountNumber && ngnExisting.currency === Currency.NGN) {
      ngnExisting.accountNumber = await this.allocateAccountNumber({
        accountNumberSource: provisioning.accountNumberSource,
        phoneNumber: provisioning.phoneNumber
      });
    }
    for (const account of existing) {
      account.tier = provisioning.tier;
      account.dailyLimitMinor = provisioning.dailyLimitMinor;
      account.maxBalanceMinor = provisioning.maxBalanceMinor;
      account.availableBalanceMinor = account.availableBalanceMinor ?? account.balanceMinor;
      account.ledgerBalanceMinor = account.ledgerBalanceMinor ?? account.balanceMinor;
      if (account.frozenReason === undefined) account.frozenReason = null;
      if (account.frozenAt === undefined) account.frozenAt = null;
    }
    if (existing.length > 0) {
      await this.accountRepo.save(existing);
    }

    const toCreate = targets.filter((c) => !existingCurrencies.has(c));
    if (toCreate.length === 0) return;

    const newAccounts = await Promise.all(
      toCreate.map(async (currency) =>
        this.accountRepo.create({
          userId,
          currency,
          type: AccountType.WALLET_MAIN,
          status: AccountStatus.ACTIVE,
          balanceMinor: '0',
          availableBalanceMinor: '0',
          ledgerBalanceMinor: '0',
          tier: provisioning.tier,
          dailyLimitMinor: provisioning.dailyLimitMinor,
          maxBalanceMinor: provisioning.maxBalanceMinor,
          frozenReason: null,
          frozenAt: null,
          label: `${currency} Wallet`,
          accountNumber:
            currency === Currency.NGN
              ? await this.allocateAccountNumber({
                  accountNumberSource: provisioning.accountNumberSource,
                  phoneNumber: provisioning.phoneNumber
                })
              : null
        })
      )
    );

    const saved = await this.accountRepo.save(newAccounts);
    for (const account of saved) {
      await this.walletEventsService.publish({
        userId,
        walletId: account.id,
        eventType: 'WALLET_CREATED',
        payload: {
          accountId: account.id,
          currency: account.currency,
          accountNumber: account.accountNumber,
          tier: account.tier,
          dailyLimitMinor: account.dailyLimitMinor,
          maxBalanceMinor: account.maxBalanceMinor
        }
      });
    }

    this.logger.log(`Provisioned base accounts for user ${userId}: ${toCreate.join(',')}`);
  }

  async syncWalletLimitsForTier(userId: string, tier: LimitTier): Promise<void> {
    const profile = LIMIT_PROFILES[tier] ?? LIMIT_PROFILES[LimitTier.TIER0];
    const tierLevel = this.toTierLevel(tier);

    await this.accountRepo.update(
      { userId, type: AccountType.WALLET_MAIN },
      {
        tier: tierLevel,
        dailyLimitMinor: (profile.daily * 100).toString(),
        maxBalanceMinor: profile.maxBalance === null ? null : (profile.maxBalance * 100).toString()
      }
    );
  }

  async getUserAccounts(userId: string): Promise<Account[]> {
    return this.accountRepo.find({
      where: { userId },
      order: { currency: 'ASC', createdAt: 'ASC' }
    });
  }

  async getCanonicalAccountNumber(userId: string, currency: Currency = Currency.NGN) {
    const account = await this.accountRepo.findOne({
      where: {
        userId,
        type: AccountType.WALLET_MAIN,
        currency
      },
      order: {
        createdAt: 'ASC'
      }
    });

    if (!account) {
      throw new WalletException(
        WalletErrorCode.WALLET_NOT_FOUND,
        `Wallet not found for ${currency}`,
        HttpStatus.NOT_FOUND
      );
    }
    if (!account.accountNumber) {
      throw new WalletException(
        WalletErrorCode.NUBAN_UNAVAILABLE,
        `Account number not provisioned for ${currency} wallet`,
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }

    return {
      accountId: account.id,
      accountNumber: account.accountNumber,
      currency: account.currency
    };
  }

  async getStatement(accountId: string, limit = 50, offset = 0) {
    const [lines, count] = await this.lineRepo.findAndCount({
      where: { accountId },
      take: limit,
      skip: offset,
      order: { createdAt: 'DESC' }
    });
    return { count, lines };
  }

  async getTransactions(accountId: string, query: WalletTransactionsQuery) {
    const page = Math.max(1, query.page ?? 1);
    const perPage = Math.min(200, Math.max(1, query.perPage ?? 20));
    const qb = this.walletTxRepo
      .createQueryBuilder('tx')
      .where('tx.wallet_id = :walletId', { walletId: accountId });

    if (query.startDate) qb.andWhere('tx.posted_at >= :startDate', { startDate: query.startDate });
    if (query.endDate) qb.andWhere('tx.posted_at <= :endDate', { endDate: query.endDate });
    if (query.category) qb.andWhere('tx.category = :category', { category: query.category.toUpperCase() });
    if (query.status) qb.andWhere('tx.status = :status', { status: query.status.toUpperCase() });
    if (query.type) qb.andWhere('tx.type = :type', { type: query.type.toUpperCase() });
    if (query.minAmountMinor) qb.andWhere('tx.amount_minor >= :minAmountMinor', { minAmountMinor: query.minAmountMinor });
    if (query.maxAmountMinor) qb.andWhere('tx.amount_minor <= :maxAmountMinor', { maxAmountMinor: query.maxAmountMinor });

    const [items, total] = await qb
      .orderBy('tx.posted_at', 'DESC')
      .take(perPage)
      .skip((page - 1) * perPage)
      .getManyAndCount();

    return {
      page,
      perPage,
      total,
      items
    };
  }

  async findById(accountId: string): Promise<Account | null> {
    return this.accountRepo.findOne({ where: { id: accountId } });
  }

  async findWalletByUserAndCurrency(userId: string, currency: Currency): Promise<Account | null> {
    return this.accountRepo.findOne({
      where: { userId, type: AccountType.WALLET_MAIN, currency }
    });
  }

  async createEscrowAccount(currency: Currency, label: string) {
    const account = this.accountRepo.create({
      userId: null,
      currency,
      type: AccountType.WALLET_ESCROW,
      status: AccountStatus.ACTIVE,
      balanceMinor: '0',
      availableBalanceMinor: '0',
      ledgerBalanceMinor: '0',
      tier: 0,
      dailyLimitMinor: '0',
      maxBalanceMinor: null,
      frozenReason: null,
      frozenAt: null,
      label,
      accountNumber: null
    });
    return this.accountRepo.save(account);
  }

  async createSavingsAccount(userId: string, currency: Currency, label: string) {
    const account = this.accountRepo.create({
      userId,
      currency,
      type: AccountType.SAVINGS,
      status: AccountStatus.ACTIVE,
      balanceMinor: '0',
      availableBalanceMinor: '0',
      ledgerBalanceMinor: '0',
      tier: 0,
      dailyLimitMinor: '0',
      maxBalanceMinor: null,
      frozenReason: null,
      frozenAt: null,
      label: `${label} Savings`,
      accountNumber: null
    });
    return this.accountRepo.save(account);
  }

  private async allocateAccountNumber(options: EnsureBaseAccountsOptions): Promise<string> {
    if (options.accountNumberSource === 'PHONE') {
      const derived = this.deriveFromPhone(options.phoneNumber);
      if (!derived) {
        throw new BadRequestException(
          'Cannot derive account number from phone. Provide a valid NG phone number.'
        );
      }
      const exists = await this.accountRepo.findOne({ where: { accountNumber: derived } });
      if (exists) {
        throw new WalletException(
          WalletErrorCode.DUPLICATE_IDEMPOTENCY,
          'Derived account number already exists',
          HttpStatus.CONFLICT
        );
      }
      return derived;
    }

    const bankCode = this.getNubanBankCode();
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const serial = randomInt(0, 1_000_000).toString().padStart(6, '0');
      const checkDigit = this.calculateNubanCheckDigit(`${bankCode}${serial}`);
      const candidate = `${bankCode}${serial}${checkDigit}`;
      const exists = await this.accountRepo.findOne({ where: { accountNumber: candidate } });
      if (!exists) {
        return candidate;
      }
    }

    throw new WalletException(
      WalletErrorCode.NUBAN_UNAVAILABLE,
      'Unable to allocate NUBAN account number',
      HttpStatus.SERVICE_UNAVAILABLE
    );
  }

  private async resolveProvisioningContext(
    userId: string,
    options: EnsureBaseAccountsOptions
  ): Promise<{
    accountNumberSource: AccountNumberSource;
    phoneNumber: string;
    tier: number;
    dailyLimitMinor: string;
    maxBalanceMinor: string | null;
  }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new WalletException(WalletErrorCode.WALLET_NOT_FOUND, 'User not found', HttpStatus.NOT_FOUND);
    }
    const accountNumberSource =
      options.accountNumberSource ?? (user.accountNumberSource === 'PHONE' ? 'PHONE' : 'SYSTEM');
    const phoneNumber = options.phoneNumber ?? user.phoneNumber;
    const profile = LIMIT_PROFILES[user.limitTier] ?? LIMIT_PROFILES[LimitTier.TIER0];

    return {
      accountNumberSource,
      phoneNumber,
      tier: this.toTierLevel(user.limitTier),
      dailyLimitMinor: (profile.daily * 100).toString(),
      maxBalanceMinor: profile.maxBalance === null ? null : (profile.maxBalance * 100).toString()
    };
  }

  private toTierLevel(tier: LimitTier): number {
    if (tier === LimitTier.TIER0) return 0;
    if (tier === LimitTier.TIER1) return 1;
    if (tier === LimitTier.TIER2) return 2;
    if (tier === LimitTier.TIER3) return 3;
    return 0;
  }

  private getNubanBankCode(): string {
    const configured = (this.configService.get<string>('wallet.nubanBankCode') ?? '340')
      .replace(/\D/g, '')
      .padStart(3, '0')
      .slice(-3);
    return configured;
  }

  private calculateNubanCheckDigit(nineDigits: string): string {
    const weights = [3, 7, 3, 3, 7, 3, 3, 7, 3];
    const digits = nineDigits.split('').map((digit) => Number.parseInt(digit, 10));
    const weighted = digits.reduce((sum, digit, index) => sum + digit * weights[index], 0);
    const remainder = weighted % 10;
    const checkDigit = (10 - remainder) % 10;
    return checkDigit.toString();
  }

  private deriveFromPhone(phoneNumber?: string): string | null {
    if (!phoneNumber) return null;
    const digits = phoneNumber.replace(/\D/g, '');
    if (/^0\d{10}$/.test(digits)) return digits.slice(1);
    if (/^234\d{10}$/.test(digits)) return digits.slice(3);
    if (/^\d{10}$/.test(digits)) return digits;
    return null;
  }
}
