import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomInt } from 'crypto';
import { Repository } from 'typeorm';

import { Account } from './entities/account.entity';
import { AccountStatus } from './enums/account-status.enum';
import { AccountType } from './enums/account-type.enum';
import { Currency } from './enums/currency.enum';
import { JournalLine } from './entities/journal-line.entity';

export type AccountNumberSource = 'PHONE' | 'SYSTEM';

interface EnsureBaseAccountsOptions {
  accountNumberSource?: AccountNumberSource;
  phoneNumber?: string;
}

@Injectable()
export class AccountsService {
  private readonly logger = new Logger(AccountsService.name);

  constructor(
    @InjectRepository(Account) private readonly accountRepo: Repository<Account>,
    @InjectRepository(JournalLine) private readonly lineRepo: Repository<JournalLine>
  ) {}

  async ensureUserBaseAccounts(userId: string, options: EnsureBaseAccountsOptions = {}): Promise<void> {
    const existing = await this.accountRepo.find({
      where: { userId, type: AccountType.WALLET_MAIN }
    });
    const existingCurrencies = new Set(existing.map((a) => a.currency));
    const targets = [Currency.NGN, Currency.USD];

    const ngnExisting = existing.find((a) => a.currency === Currency.NGN);
    if (ngnExisting && !ngnExisting.accountNumber) {
      ngnExisting.accountNumber = await this.allocateAccountNumber(options);
      await this.accountRepo.save(ngnExisting);
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
        label: `${currency} Wallet`,
        accountNumber: currency === Currency.NGN ? await this.allocateAccountNumber(options) : null
      })
      )
    );

    await this.accountRepo.save(newAccounts);
    this.logger.log(`Provisioned base accounts for user ${userId}: ${toCreate.join(',')}`);
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
      throw new NotFoundException(`Wallet not found for ${currency}`);
    }
    if (!account.accountNumber) {
      throw new NotFoundException(`Account number not provisioned for ${currency} wallet`);
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

  async findById(accountId: string): Promise<Account | null> {
    return this.accountRepo.findOne({ where: { id: accountId } });
  }

  async createEscrowAccount(currency: Currency, label: string) {
    const account = this.accountRepo.create({
      userId: null,
      currency,
      type: AccountType.WALLET_ESCROW,
      status: AccountStatus.ACTIVE,
      balanceMinor: '0',
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
        throw new ConflictException('Derived account number already exists');
      }
      return derived;
    }

    for (let attempt = 0; attempt < 50; attempt += 1) {
      const candidate = `34${randomInt(0, 100_000_000).toString().padStart(8, '0')}`;
      const exists = await this.accountRepo.findOne({ where: { accountNumber: candidate } });
      if (!exists) {
        return candidate;
      }
    }

    throw new ConflictException('Unable to allocate account number');
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
