import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException
} from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';

import { Account } from './entities/account.entity';
import { JournalEntry } from './entities/journal-entry.entity';
import { JournalLine } from './entities/journal-line.entity';
import { EntryDirection } from './enums/entry-direction.enum';
import { AccountType } from './enums/account-type.enum';
import { Currency } from './enums/currency.enum';
import { JournalStatus } from './enums/journal-status.enum';
import { addMinor, ensureNonNegative, subtractMinor } from './utils/amount';

interface LedgerLineInput {
  accountId: string;
  direction: EntryDirection;
  amountMinor: string;
  currency: Currency;
  memo?: string;
}

interface PostEntryParams {
  reference: string;
  idempotencyKey?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  lines: LedgerLineInput[];
  enforceNonNegative?: boolean;
}

interface TransferParams {
  sourceAccountId: string;
  destinationAccountId: string;
  amountMinor: string;
  currency: Currency;
  description?: string;
  idempotencyKey?: string;
  feeAccountId?: string;
  feeAmountMinor?: string;
}

@Injectable()
export class LedgerService {
  private readonly logger = new Logger(LedgerService.name);

  constructor(private readonly dataSource: DataSource) {}

  async transfer(params: TransferParams) {
    const reference = `TRF-${Date.now()}`;
    const lines: LedgerLineInput[] = [
      {
        accountId: params.sourceAccountId,
        direction: EntryDirection.DEBIT,
        amountMinor: params.amountMinor,
        currency: params.currency
      },
      {
        accountId: params.destinationAccountId,
        direction: EntryDirection.CREDIT,
        amountMinor: params.amountMinor,
        currency: params.currency
      }
    ];

    if (params.feeAccountId && params.feeAmountMinor) {
      lines.push({
        accountId: params.sourceAccountId,
        direction: EntryDirection.DEBIT,
        amountMinor: params.feeAmountMinor,
        currency: params.currency
      });
      lines.push({
        accountId: params.feeAccountId,
        direction: EntryDirection.CREDIT,
        amountMinor: params.feeAmountMinor,
        currency: params.currency
      });
    }

    return this.postEntry({
      reference,
      idempotencyKey: params.idempotencyKey,
      description: params.description ?? 'Transfer',
      enforceNonNegative: true,
      lines
    });
  }

  async postEntry(params: PostEntryParams) {
    this.validateBalanced(params.lines);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      if (params.idempotencyKey) {
        const existing = await queryRunner.manager.findOne(JournalEntry, {
          where: { idempotencyKey: params.idempotencyKey },
          relations: ['lines']
        });
        if (existing) {
          await queryRunner.rollbackTransaction();
          return existing;
        }
      }

      const accounts = await this.fetchAccountsWithLock(
        params.lines.map((l) => l.accountId),
        queryRunner
      );

      const entry = queryRunner.manager.create(JournalEntry, {
        reference: params.reference,
        idempotencyKey: params.idempotencyKey ?? null,
        description: params.description ?? null,
        status: JournalStatus.POSTED,
        metadata: params.metadata ?? null
      });
      await queryRunner.manager.save(entry);

      for (const line of params.lines) {
        const account = accounts.get(line.accountId);
        if (!account) {
          throw new NotFoundException(`Account ${line.accountId} not found`);
        }
        if (account.currency !== line.currency) {
          throw new BadRequestException('Currency mismatch for account');
        }
        if (account.status !== 'ACTIVE') {
          throw new BadRequestException(`Account ${account.id} is not active`);
        }

        account.balanceMinor = this.applyLineToBalance(account, line);
        if (params.enforceNonNegative) {
          ensureNonNegative(account.balanceMinor, `Account ${account.id} balance`);
        }

        const journalLine = queryRunner.manager.create(JournalLine, {
          journalEntryId: entry.id,
          journalEntry: entry,
          accountId: account.id,
          account,
          direction: line.direction,
          amountMinor: line.amountMinor,
          currency: line.currency,
          memo: line.memo ?? null
        });
        await queryRunner.manager.save(journalLine);
        await queryRunner.manager.save(account);
      }

      await queryRunner.commitTransaction();
      this.logger.log(`Posted journal entry ${entry.reference}`);
      return entry;
    } catch (error: unknown) {
      await queryRunner.rollbackTransaction();
      const dbErrorCode =
        typeof error === 'object' && error !== null && 'code' in error
          ? (error as { code?: string }).code
          : undefined;
      if (dbErrorCode === '23505') {
        throw new ConflictException('Reference or idempotency key already used');
      }
      throw error instanceof BadRequestException || error instanceof NotFoundException
        ? error
        : new InternalServerErrorException(
            error instanceof Error ? error.message : 'Unexpected ledger error'
          );
    } finally {
      await queryRunner.release();
    }
  }

  private validateBalanced(lines: LedgerLineInput[]) {
    const debits = lines
      .filter((l) => l.direction === EntryDirection.DEBIT)
      .reduce((sum, l) => sum + BigInt(l.amountMinor), 0n);
    const credits = lines
      .filter((l) => l.direction === EntryDirection.CREDIT)
      .reduce((sum, l) => sum + BigInt(l.amountMinor), 0n);
    if (debits !== credits) {
      throw new BadRequestException('Debits and credits must balance');
    }
  }

  private async fetchAccountsWithLock(accountIds: string[], queryRunner: QueryRunner) {
    const accounts = await queryRunner.manager
      .getRepository(Account)
      .createQueryBuilder('account')
      .setLock('pessimistic_write')
      .where('account.id IN (:...ids)', { ids: accountIds })
      .getMany();

    const map = new Map<string, Account>();
    accounts.forEach((a: Account) => map.set(a.id, a));
    return map;
  }

  private applyLineToBalance(account: Account, line: LedgerLineInput): string {
    const amount = line.amountMinor;
    const normal = this.normalBalanceFor(account.type);
    if (line.direction === normal) {
      return addMinor(account.balanceMinor, amount);
    }
    return subtractMinor(account.balanceMinor, amount);
  }

  private normalBalanceFor(type: AccountType): EntryDirection {
    switch (type) {
      case AccountType.TREASURY:
      case AccountType.RESERVE:
        return EntryDirection.DEBIT; // assets
      case AccountType.WALLET_MAIN:
      case AccountType.WALLET_ESCROW:
      case AccountType.FEES:
      case AccountType.SAVINGS:
      default:
        return EntryDirection.CREDIT; // liabilities/revenue
    }
  }
}
