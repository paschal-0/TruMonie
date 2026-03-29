import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Account } from './entities/account.entity';
import { AccountStatus } from './enums/account-status.enum';
import { AccountType } from './enums/account-type.enum';
import { Currency } from './enums/currency.enum';
import { JournalLine } from './entities/journal-line.entity';

@Injectable()
export class AccountsService {
  private readonly logger = new Logger(AccountsService.name);

  constructor(
    @InjectRepository(Account) private readonly accountRepo: Repository<Account>,
    @InjectRepository(JournalLine) private readonly lineRepo: Repository<JournalLine>
  ) {}

  async ensureUserBaseAccounts(userId: string): Promise<void> {
    const existing = await this.accountRepo.find({
      where: { userId, type: AccountType.WALLET_MAIN }
    });
    const existingCurrencies = new Set(existing.map((a) => a.currency));
    const targets = [Currency.NGN, Currency.USD];

    const toCreate = targets.filter((c) => !existingCurrencies.has(c));
    if (toCreate.length === 0) return;

    const newAccounts = toCreate.map((currency) =>
      this.accountRepo.create({
        userId,
        currency,
        type: AccountType.WALLET_MAIN,
        status: AccountStatus.ACTIVE,
        balanceMinor: '0',
        label: `${currency} Wallet`
      })
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
      label
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
      label: `${label} Savings`
    });
    return this.accountRepo.save(account);
  }
}
