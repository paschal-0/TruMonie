import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryRunner, Repository } from 'typeorm';

import { REDIS_CLIENT } from '../redis/redis.module';
import { DEFAULT_GL_CHART, resolveGlAccountCode } from './core-banking.chart';
import { CoreBankingErrorCode, CoreBankingException } from './core-banking.errors';
import { Account } from './entities/account.entity';
import { GlAccount, GlNormalBalance } from './entities/gl-account.entity';
import { GlPosting } from './entities/gl-posting.entity';
import { JournalEntry } from './entities/journal-entry.entity';
import { JournalLine } from './entities/journal-line.entity';
import {
  WalletTransaction,
  WalletTransactionStatus,
  WalletTransactionType
} from './entities/wallet-transaction.entity';
import { EntryDirection } from './enums/entry-direction.enum';
import { AccountStatus } from './enums/account-status.enum';
import { AccountType } from './enums/account-type.enum';
import { Currency } from './enums/currency.enum';
import { JournalStatus } from './enums/journal-status.enum';
import { addMinor, ensureNonNegative, subtractMinor } from './utils/amount';
import { WalletErrorCode, WalletException } from './wallet.errors';
import { WalletEventsService } from './wallet-events.service';

interface LedgerLineInput {
  accountId: string;
  direction: EntryDirection;
  amountMinor: string;
  currency: Currency;
  memo?: string;
  category?: string;
  channel?: string;
  sessionId?: string;
  status?: WalletTransactionStatus;
  feeMinor?: string;
  counterparty?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
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
export class LedgerService implements OnModuleInit {
  private readonly logger = new Logger(LedgerService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly walletEventsService: WalletEventsService,
    @InjectRepository(GlAccount)
    private readonly glAccountRepo: Repository<GlAccount>,
    @Inject(REDIS_CLIENT)
    private readonly redisClient: {
      set: (key: string, value: string) => Promise<'OK' | null>;
    }
  ) {}

  async onModuleInit() {
    await this.ensureDefaultGlAccounts();
  }

  async transfer(params: TransferParams) {
    const reference = `TRF-${Date.now()}`;
    const lines: LedgerLineInput[] = [
      {
        accountId: params.sourceAccountId,
        direction: EntryDirection.DEBIT,
        amountMinor: params.amountMinor,
        currency: params.currency,
        category: 'TRANSFER',
        status: WalletTransactionStatus.SUCCESS
      },
      {
        accountId: params.destinationAccountId,
        direction: EntryDirection.CREDIT,
        amountMinor: params.amountMinor,
        currency: params.currency,
        category: 'TRANSFER',
        status: WalletTransactionStatus.SUCCESS
      }
    ];

    if (params.feeAccountId && params.feeAmountMinor) {
      lines.push({
        accountId: params.sourceAccountId,
        direction: EntryDirection.DEBIT,
        amountMinor: params.feeAmountMinor,
        currency: params.currency,
        category: 'FEE',
        status: WalletTransactionStatus.SUCCESS
      });
      lines.push({
        accountId: params.feeAccountId,
        direction: EntryDirection.CREDIT,
        amountMinor: params.feeAmountMinor,
        currency: params.currency,
        category: 'FEE',
        status: WalletTransactionStatus.SUCCESS
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
      const walletBalanceUpdates: Array<{
        userId: string;
        walletId: string;
        balanceMinor: string;
        availableBalanceMinor: string;
        ledgerBalanceMinor: string;
      }> = [];
      const valueDate =
        this.readStringFromMetadata(params.metadata, 'valueDate') ??
        new Date().toISOString().slice(0, 10);
      const postedBy =
        this.readStringFromMetadata(params.metadata, 'postedBy') ?? 'core-banking-engine';

      const entry = queryRunner.manager.create(JournalEntry, {
        reference: params.reference,
        idempotencyKey: params.idempotencyKey ?? null,
        description: params.description ?? null,
        status: JournalStatus.POSTED,
        metadata: params.metadata ?? null
      });
      await queryRunner.manager.save(entry);

      for (let lineIndex = 0; lineIndex < params.lines.length; lineIndex += 1) {
        const line = params.lines[lineIndex];
        const account = accounts.get(line.accountId);
        if (!account) {
          throw new WalletException(
            WalletErrorCode.WALLET_NOT_FOUND,
            `Account ${line.accountId} not found`,
            HttpStatus.NOT_FOUND
          );
        }
        if (account.currency !== line.currency) {
          throw new BadRequestException('Currency mismatch for account');
        }
        if (account.status !== AccountStatus.ACTIVE || account.frozenAt) {
          throw new WalletException(
            WalletErrorCode.WALLET_INACTIVE,
            `Account ${account.id} is not active`,
            HttpStatus.FORBIDDEN
          );
        }

        const balanceBeforeMinor = account.balanceMinor;
        const balanceAfterMinor = this.applyLineToBalance(account, line);
        if (params.enforceNonNegative) {
          ensureNonNegative(balanceAfterMinor, `Account ${account.id} balance`);
        }
        account.balanceMinor = balanceAfterMinor;
        account.availableBalanceMinor = balanceAfterMinor;
        account.ledgerBalanceMinor = balanceAfterMinor;

        const journalLine = queryRunner.manager.create(JournalLine, {
          journalEntryId: entry.id,
          journalEntry: entry,
          accountId: account.id,
          account,
          direction: line.direction,
          amountMinor: line.amountMinor,
          currency: line.currency,
          memo: line.memo ?? null,
          valueDate,
          postedBy
        });
        await queryRunner.manager.save(journalLine);

        if (account.userId && this.shouldRecordWalletTransaction(account.type)) {
          const walletTx = queryRunner.manager.create(WalletTransaction, {
            reference: `${entry.reference}-${lineIndex + 1}`,
            walletId: account.id,
            userId: account.userId,
            type:
              line.direction === EntryDirection.CREDIT
                ? WalletTransactionType.CREDIT
                : WalletTransactionType.DEBIT,
            category: (line.category ?? this.defaultCategory(params.description)).toUpperCase(),
            amountMinor: line.amountMinor,
            feeMinor: line.feeMinor ?? '0',
            status: line.status ?? WalletTransactionStatus.SUCCESS,
            description: line.memo ?? params.description ?? 'Wallet transaction',
            counterparty: line.counterparty ?? null,
            balanceBeforeMinor,
            balanceAfterMinor,
            channel: line.channel ?? this.readStringFromMetadata(params.metadata, 'channel'),
            sessionId: line.sessionId ?? this.readStringFromMetadata(params.metadata, 'sessionId'),
            metadata: this.mergeMetadata(params.metadata, line.metadata),
            postedAt: new Date()
          });
          await queryRunner.manager.save(walletTx);
          walletBalanceUpdates.push({
            userId: account.userId,
            walletId: account.id,
            balanceMinor: account.balanceMinor,
            availableBalanceMinor: account.availableBalanceMinor,
            ledgerBalanceMinor: account.ledgerBalanceMinor
          });
        }

        await queryRunner.manager.save(account);
      }

      await this.persistGlPostings({
        queryRunner,
        journalEntryId: entry.id,
        description: params.description ?? 'Ledger posting',
        valueDate,
        postedBy,
        lines: params.lines,
        accounts
      });

      await queryRunner.commitTransaction();
      await this.publishBalanceUpdates(walletBalanceUpdates);
      this.logger.log(`Posted journal entry ${entry.reference}`);
      return entry;
    } catch (error: unknown) {
      await queryRunner.rollbackTransaction();
      const dbErrorCode =
        typeof error === 'object' && error !== null && 'code' in error
          ? (error as { code?: string }).code
          : undefined;
      if (dbErrorCode === '23505') {
        throw new WalletException(
          WalletErrorCode.DUPLICATE_IDEMPOTENCY,
          'Reference or idempotency key already used',
          HttpStatus.CONFLICT
        );
      }
      if (error instanceof BadRequestException && error.message.includes('would become negative')) {
        throw new WalletException(
          WalletErrorCode.INSUFFICIENT_FUNDS,
          'Insufficient funds',
          HttpStatus.BAD_REQUEST
        );
      }
      throw error instanceof HttpException
        ? error
        : new InternalServerErrorException(
            error instanceof Error ? error.message : 'Unexpected ledger error'
          );
    } finally {
      await queryRunner.release();
    }
  }

  private async ensureDefaultGlAccounts() {
    try {
      for (const item of DEFAULT_GL_CHART) {
        const existing = await this.glAccountRepo.findOne({ where: { accountCode: item.accountCode } });
        if (existing) {
          existing.accountName = item.accountName;
          existing.parentCode = item.parentCode;
          existing.accountType = item.accountType;
          existing.normalBalance = item.normalBalance;
          existing.isActive = true;
          await this.glAccountRepo.save(existing);
          continue;
        }

        await this.glAccountRepo.save(
          this.glAccountRepo.create({
            accountCode: item.accountCode,
            accountName: item.accountName,
            parentCode: item.parentCode,
            accountType: item.accountType,
            normalBalance: item.normalBalance,
            currency: 'NGN',
            balanceMinor: '0',
            isActive: true
          })
        );
      }
    } catch (error) {
      this.logger.warn(
        `GL chart initialization skipped: ${error instanceof Error ? error.message : 'unknown error'}`
      );
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
    const uniqueIds = [...new Set(accountIds)];
    for (const accountId of uniqueIds) {
      await queryRunner.query('SELECT pg_advisory_xact_lock(hashtext($1))', [accountId]);
    }

    const accounts = await queryRunner.manager
      .getRepository(Account)
      .createQueryBuilder('account')
      .setLock('pessimistic_write')
      .where('account.id IN (:...ids)', { ids: uniqueIds })
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

  private shouldRecordWalletTransaction(type: AccountType): boolean {
    return (
      type === AccountType.WALLET_MAIN ||
      type === AccountType.SAVINGS ||
      type === AccountType.AGENT
    );
  }

  private defaultCategory(description?: string): string {
    if (!description) return 'TRANSFER';
    const normalized = description.toLowerCase();
    if (normalized.includes('fund')) return 'FUNDING';
    if (normalized.includes('payout') || normalized.includes('bank transfer')) return 'PAYOUT';
    if (normalized.includes('fee')) return 'FEE';
    return 'TRANSFER';
  }

  private readStringFromMetadata(
    metadata: Record<string, unknown> | undefined,
    key: string
  ): string | null {
    const value = metadata?.[key];
    return typeof value === 'string' ? value : null;
  }

  private mergeMetadata(
    entryMetadata: Record<string, unknown> | undefined,
    lineMetadata: Record<string, unknown> | undefined
  ): Record<string, unknown> | null {
    const merged = {
      ...(entryMetadata ?? {}),
      ...(lineMetadata ?? {})
    };
    return Object.keys(merged).length > 0 ? merged : null;
  }

  private async publishBalanceUpdates(
    updates: Array<{
      userId: string;
      walletId: string;
      balanceMinor: string;
      availableBalanceMinor: string;
      ledgerBalanceMinor: string;
    }>
  ) {
    if (updates.length === 0) return;
    const latest = new Map<string, (typeof updates)[number]>();
    updates.forEach((update) => latest.set(update.walletId, update));

    for (const update of latest.values()) {
      try {
        await this.redisClient.set(
          `wallet:balance:${update.walletId}`,
          JSON.stringify({
            balanceMinor: update.balanceMinor,
            availableBalanceMinor: update.availableBalanceMinor,
            ledgerBalanceMinor: update.ledgerBalanceMinor
          })
        );
        await this.walletEventsService.publish({
          userId: update.userId,
          walletId: update.walletId,
          eventType: 'BALANCE_UPDATED',
          payload: {
            balanceMinor: update.balanceMinor,
            availableBalanceMinor: update.availableBalanceMinor,
            ledgerBalanceMinor: update.ledgerBalanceMinor
          }
        });
      } catch (error) {
        this.logger.warn(
          `Failed to publish balance update for wallet=${update.walletId}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`
        );
      }
    }
  }

  private normalBalanceFor(type: AccountType): EntryDirection {
    switch (type) {
      case AccountType.TREASURY:
      case AccountType.RESERVE:
        return EntryDirection.DEBIT; // assets
      case AccountType.WALLET_MAIN:
      case AccountType.AGENT:
      case AccountType.WALLET_ESCROW:
      case AccountType.FEES:
      case AccountType.SAVINGS:
      default:
        return EntryDirection.CREDIT; // liabilities/revenue
    }
  }

  private async persistGlPostings(params: {
    queryRunner: QueryRunner;
    journalEntryId: string;
    description: string;
    valueDate: string;
    postedBy: string;
    lines: LedgerLineInput[];
    accounts: Map<string, Account>;
  }) {
    const postingCandidates = params.lines.map((line) => {
      const account = params.accounts.get(line.accountId);
      if (!account) {
        throw new CoreBankingException(
          CoreBankingErrorCode.INVALID_POSTING_RULE,
          `Missing account in posting context: ${line.accountId}`
        );
      }
      const glCode = resolveGlAccountCode({
        accountType: account.type,
        category: line.category,
        direction: line.direction
      });
      return {
        glCode,
        direction: line.direction,
        amountMinor: line.amountMinor
      };
    });

    const debit = postingCandidates
      .filter((candidate) => candidate.direction === EntryDirection.DEBIT)
      .reduce((sum, candidate) => sum + BigInt(candidate.amountMinor), 0n);
    const credit = postingCandidates
      .filter((candidate) => candidate.direction === EntryDirection.CREDIT)
      .reduce((sum, candidate) => sum + BigInt(candidate.amountMinor), 0n);
    if (debit !== credit) {
      throw new CoreBankingException(
        CoreBankingErrorCode.LEDGER_IMBALANCE,
        'Ledger imbalance - debits != credits'
      );
    }

    const glCodes = [...new Set(postingCandidates.map((candidate) => candidate.glCode))];
    const glAccounts = await params.queryRunner.manager
      .getRepository(GlAccount)
      .createQueryBuilder('glAccount')
      .setLock('pessimistic_write')
      .where('glAccount.accountCode IN (:...codes)', { codes: glCodes })
      .getMany();
    const glAccountMap = new Map(glAccounts.map((account) => [account.accountCode, account]));

    for (const glCode of glCodes) {
      if (!glAccountMap.has(glCode)) {
        throw new CoreBankingException(
          CoreBankingErrorCode.GL_ACCOUNT_NOT_FOUND,
          `GL account not found: ${glCode}`
        );
      }
    }

    for (const candidate of postingCandidates) {
      const glAccount = glAccountMap.get(candidate.glCode);
      if (!glAccount) {
        throw new CoreBankingException(
          CoreBankingErrorCode.GL_ACCOUNT_NOT_FOUND,
          `GL account not found: ${candidate.glCode}`
        );
      }
      const posting = params.queryRunner.manager.create(GlPosting, {
        transactionId: params.journalEntryId,
        glAccountCode: candidate.glCode,
        entryType: candidate.direction,
        amountMinor: candidate.amountMinor,
        narration: params.description,
        valueDate: params.valueDate,
        postedBy: params.postedBy
      });
      await params.queryRunner.manager.save(posting);
      glAccount.balanceMinor = this.applyGlBalance(
        glAccount.normalBalance,
        glAccount.balanceMinor,
        candidate.direction,
        candidate.amountMinor
      );
    }

    await params.queryRunner.manager.save(Array.from(glAccountMap.values()));
  }

  private applyGlBalance(
    normalBalance: GlNormalBalance,
    currentBalanceMinor: string,
    direction: EntryDirection,
    amountMinor: string
  ) {
    const current = BigInt(currentBalanceMinor);
    const amount = BigInt(amountMinor);
    const normalDirection =
      normalBalance === GlNormalBalance.DEBIT ? EntryDirection.DEBIT : EntryDirection.CREDIT;
    return direction === normalDirection ? (current + amount).toString() : (current - amount).toString();
  }
}
