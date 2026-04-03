import {
  BadRequestException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  NotFoundException
} from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

import { MerchantStatus } from '../merchant/entities/merchant.entity';
import { CoreBankingErrorCode, CoreBankingException } from './core-banking.errors';
import { DEFAULT_GL_CHART } from './core-banking.chart';
import { CreateProfitPoolDto } from './dto/create-profit-pool.dto';
import { DistributeProfitDto } from './dto/distribute-profit.dto';
import { GlAccount, GlNormalBalance } from './entities/gl-account.entity';
import { GlPosting } from './entities/gl-posting.entity';
import { ProfitDistribution } from './entities/profit-distribution.entity';
import {
  ProfitPoolStatus,
  ProfitSharingPool
} from './entities/profit-sharing-pool.entity';
import { EntryDirection } from './enums/entry-direction.enum';

interface TrialBalanceRow {
  accountCode: string;
  accountName: string;
  accountType: string;
  normalBalance: string;
  currency: string;
  balanceMinor: string;
}

@Injectable()
export class CoreBankingService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(GlAccount)
    private readonly glAccountRepo: Repository<GlAccount>,
    @InjectRepository(ProfitSharingPool)
    private readonly poolRepo: Repository<ProfitSharingPool>,
    @InjectRepository(ProfitDistribution)
    private readonly distributionRepo: Repository<ProfitDistribution>
  ) {}

  async initializeChartOfAccounts() {
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
    return this.listGlAccounts();
  }

  async listGlAccounts() {
    return this.glAccountRepo.find({
      where: { isActive: true },
      order: { accountCode: 'ASC' }
    });
  }

  async getTrialBalance(asOf?: string) {
    try {
      const rows = await this.trialBalanceRows(asOf);
      const mapped = rows.map((row) => this.toTrialBalanceLine(row));
      const totalDebits = mapped.reduce((sum, row) => sum + BigInt(row.debit_balance_minor), 0n);
      const totalCredits = mapped.reduce((sum, row) => sum + BigInt(row.credit_balance_minor), 0n);
      return {
        as_of: this.normalizeAsOf(asOf),
        lines: mapped,
        totals: {
          debit_minor: totalDebits.toString(),
          credit_minor: totalCredits.toString(),
          balanced: totalDebits === totalCredits
        }
      };
    } catch (error) {
      throw new CoreBankingException(
        CoreBankingErrorCode.REPORTING_ENGINE_UNAVAILABLE,
        'Reporting engine unavailable',
        HttpStatus.SERVICE_UNAVAILABLE,
        {
          reason: error instanceof Error ? error.message : 'unknown'
        }
      );
    }
  }

  async getBalanceSheet(asOf?: string) {
    const rows = await this.trialBalanceRows(asOf);
    const assets = rows.filter((row) => row.accountType === 'ASSET').map((row) => this.toAmountLine(row));
    const liabilities = rows
      .filter((row) => row.accountType === 'LIABILITY')
      .map((row) => this.toAmountLine(row));
    const equity = rows.filter((row) => row.accountType === 'EQUITY').map((row) => this.toAmountLine(row));

    return {
      as_of: this.normalizeAsOf(asOf),
      assets,
      liabilities,
      equity,
      totals: {
        assets_minor: this.sumLines(assets),
        liabilities_minor: this.sumLines(liabilities),
        equity_minor: this.sumLines(equity)
      }
    };
  }

  async getIncomeStatement(from: string, to: string) {
    if (new Date(from).getTime() > new Date(to).getTime()) {
      throw new BadRequestException('from must be before or equal to to');
    }

    const rows = await this.dataSource.query(
      `
      SELECT
        ga.account_code AS "accountCode",
        ga.account_name AS "accountName",
        ga.account_type AS "accountType",
        COALESCE(
          SUM(
            CASE
              WHEN gp.entry_type = ga.normal_balance THEN gp.amount_minor::numeric
              ELSE -gp.amount_minor::numeric
            END
          ),
          0
        )::bigint AS "balanceMinor"
      FROM gl_accounts ga
      LEFT JOIN gl_postings gp
        ON gp.gl_account_code = ga.account_code
       AND gp.value_date >= $1
       AND gp.value_date <= $2
      WHERE ga.account_type IN ('INCOME', 'EXPENSE')
      GROUP BY ga.account_code, ga.account_name, ga.account_type, ga.normal_balance
      ORDER BY ga.account_code ASC
      `,
      [from, to]
    );

    const incomes = (rows as Array<{ accountCode: string; accountName: string; accountType: string; balanceMinor: string }>)
      .filter((row) => row.accountType === 'INCOME')
      .map((row) => ({
        account_code: row.accountCode,
        account_name: row.accountName,
        amount_minor: this.asPositive(row.balanceMinor).toString()
      }));
    const expenses = (rows as Array<{ accountCode: string; accountName: string; accountType: string; balanceMinor: string }>)
      .filter((row) => row.accountType === 'EXPENSE')
      .map((row) => ({
        account_code: row.accountCode,
        account_name: row.accountName,
        amount_minor: this.asPositive(row.balanceMinor).toString()
      }));

    const totalIncome = incomes.reduce((sum, row) => sum + BigInt(row.amount_minor), 0n);
    const totalExpense = expenses.reduce((sum, row) => sum + BigInt(row.amount_minor), 0n);

    return {
      from,
      to,
      income: incomes,
      expenses,
      totals: {
        income_minor: totalIncome.toString(),
        expense_minor: totalExpense.toString(),
        net_profit_minor: (totalIncome - totalExpense).toString()
      }
    };
  }

  async generateMmfbr300(month: string) {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new BadRequestException('month must be in YYYY-MM format');
    }
    const start = new Date(`${month}-01T00:00:00.000Z`);
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    const asOf = new Date(end.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const trial = await this.trialBalanceRows(asOf);

    const getByPrefix = (prefix: string) =>
      trial
        .filter((row) => row.accountCode.startsWith(prefix))
        .reduce((sum, row) => sum + this.asPositive(row.balanceMinor), 0n);

    const txCountRow = await this.dataSource.query(
      `SELECT COUNT(*)::int AS count FROM journal_entries WHERE created_at >= $1 AND created_at < $2`,
      [start.toISOString(), end.toISOString()]
    );
    const txValueRow = await this.dataSource.query(
      `
      SELECT COALESCE(SUM(jl.amount_minor::numeric), 0)::bigint AS value
      FROM journal_lines jl
      WHERE jl.direction = 'DEBIT'
        AND jl.created_at >= $1
        AND jl.created_at < $2
      `,
      [start.toISOString(), end.toISOString()]
    );
    const activeAccountsRow = await this.dataSource.query(
      `
      SELECT COUNT(*)::int AS count
      FROM accounts
      WHERE status = 'ACTIVE' AND user_id IS NOT NULL
      `
    );

    let agentCount = 0;
    try {
      const agentCountRow = await this.dataSource.query(
        `SELECT COUNT(*)::int AS count FROM merchants WHERE status = $1`,
        [MerchantStatus.APPROVED]
      );
      agentCount = Number(agentCountRow[0]?.count ?? 0);
    } catch {
      agentCount = 0;
    }

    return {
      reporting_period: month,
      total_deposits_minor: getByPrefix('21').toString(),
      total_assets_minor: getByPrefix('1').toString(),
      total_liabilities_minor: getByPrefix('2').toString(),
      equity_minor: getByPrefix('3').toString(),
      income_minor: getByPrefix('4').toString(),
      expenses_minor: getByPrefix('5').toString(),
      transaction_volume: Number(txCountRow[0]?.count ?? 0),
      transaction_value_minor: (txValueRow[0]?.value ?? '0').toString(),
      active_accounts: Number(activeAccountsRow[0]?.count ?? 0),
      agent_count: agentCount
    };
  }

  async createProfitPool(dto: CreateProfitPoolDto) {
    const ratio = Number((dto.psr_investor + dto.psr_manager).toFixed(6));
    if (Math.abs(ratio - 1) > 0.000001) {
      throw new BadRequestException('psr_investor + psr_manager must equal 1');
    }
    if (new Date(dto.period_start).getTime() > new Date(dto.period_end).getTime()) {
      throw new BadRequestException('period_start must be before period_end');
    }

    const created = await this.poolRepo.save(
      this.poolRepo.create({
        poolName: dto.pool_name.trim(),
        poolType: dto.pool_type,
        totalCapitalMinor: dto.total_capital_minor.toString(),
        periodStart: dto.period_start.slice(0, 10),
        periodEnd: dto.period_end.slice(0, 10),
        psrInvestor: dto.psr_investor.toFixed(6),
        psrManager: dto.psr_manager.toFixed(6),
        perRate: dto.per_rate.toFixed(6),
        status: ProfitPoolStatus.ACTIVE
      })
    );
    return created;
  }

  async listProfitPools() {
    return this.poolRepo.find({ order: { createdAt: 'DESC' } });
  }

  async listPoolDistributions(poolId: string) {
    return this.distributionRepo.find({
      where: { poolId },
      order: { createdAt: 'DESC' }
    });
  }

  async distributeProfit(poolId: string, dto: DistributeProfitDto) {
    const pool = await this.poolRepo.findOne({ where: { id: poolId } });
    if (!pool) {
      throw new NotFoundException('Profit-sharing pool not found');
    }
    if (pool.status !== ProfitPoolStatus.ACTIVE) {
      throw new BadRequestException('Pool is not active');
    }
    if (dto.period.slice(0, 10) > pool.periodEnd) {
      throw new CoreBankingException(
        CoreBankingErrorCode.POOL_PERIOD_EXPIRED,
        'Pool period expired'
      );
    }

    const gross = BigInt(dto.gross_earnings_minor);
    const expenses = BigInt(dto.expenses_minor);
    const perRateMicros = BigInt(Math.round(Number(pool.perRate) * 1_000_000));
    const investorMicros = BigInt(Math.round(Number(pool.psrInvestor) * 1_000_000));
    const perAllocation = (gross * perRateMicros) / 1_000_000n;
    const distributable = gross - expenses - perAllocation;
    if (distributable < 0n) {
      throw new CoreBankingException(
        CoreBankingErrorCode.PROFIT_SHARING_CALCULATION_ERROR,
        'Profit sharing calculation error: distributable is negative'
      );
    }

    const investorShare = (distributable * investorMicros) / 1_000_000n;
    const managerShare = distributable - investorShare;

    const distribution = await this.distributionRepo.save(
      this.distributionRepo.create({
        poolId,
        period: dto.period.slice(0, 10),
        grossEarningsMinor: gross.toString(),
        expensesMinor: expenses.toString(),
        perAllocationMinor: perAllocation.toString(),
        distributableMinor: distributable.toString(),
        investorShareMinor: investorShare.toString(),
        managerShareMinor: managerShare.toString(),
        distributedAt: new Date()
      })
    );

    if (investorShare > 0n) {
      await this.postGlEntriesForProfitDistribution(distribution.id, dto.period.slice(0, 10), investorShare);
    }

    return distribution;
  }

  private async postGlEntriesForProfitDistribution(
    distributionId: string,
    valueDate: string,
    investorShareMinor: bigint
  ) {
    await this.dataSource.transaction(async (manager) => {
      const income = await manager.findOne(GlAccount, {
        where: { accountCode: '4300' },
        lock: { mode: 'pessimistic_write' }
      });
      const expense = await manager.findOne(GlAccount, {
        where: { accountCode: '5300' },
        lock: { mode: 'pessimistic_write' }
      });
      if (!income || !expense) {
        throw new CoreBankingException(
          CoreBankingErrorCode.GL_ACCOUNT_NOT_FOUND,
          'Required GL account not found for profit distribution'
        );
      }

      const debitTotal = investorShareMinor;
      const creditTotal = investorShareMinor;
      if (debitTotal !== creditTotal) {
        throw new CoreBankingException(
          CoreBankingErrorCode.LEDGER_IMBALANCE,
          'Ledger imbalance - debits != credits'
        );
      }

      await manager.save(
        GlPosting,
        manager.create(GlPosting, {
          transactionId: distributionId,
          glAccountCode: income.accountCode,
          entryType: EntryDirection.DEBIT,
          amountMinor: investorShareMinor.toString(),
          narration: 'Mudarabah/Musharakah profit distribution',
          valueDate,
          postedBy: 'core-banking-engine'
        })
      );
      await manager.save(
        GlPosting,
        manager.create(GlPosting, {
          transactionId: distributionId,
          glAccountCode: expense.accountCode,
          entryType: EntryDirection.CREDIT,
          amountMinor: investorShareMinor.toString(),
          narration: 'Mudarabah/Musharakah profit distribution',
          valueDate,
          postedBy: 'core-banking-engine'
        })
      );

      income.balanceMinor = this.applyGlBalance(income, EntryDirection.DEBIT, investorShareMinor.toString());
      expense.balanceMinor = this.applyGlBalance(
        expense,
        EntryDirection.CREDIT,
        investorShareMinor.toString()
      );
      await manager.save(GlAccount, income);
      await manager.save(GlAccount, expense);
    });
  }

  private applyGlBalance(account: GlAccount, direction: EntryDirection, amountMinor: string) {
    const current = BigInt(account.balanceMinor);
    const amount = BigInt(amountMinor);
    const normalDirection =
      account.normalBalance === GlNormalBalance.DEBIT ? EntryDirection.DEBIT : EntryDirection.CREDIT;
    return direction === normalDirection ? (current + amount).toString() : (current - amount).toString();
  }

  private normalizeAsOf(asOf?: string) {
    if (!asOf) return new Date().toISOString().slice(0, 10);
    return asOf.slice(0, 10);
  }

  private async trialBalanceRows(asOf?: string): Promise<TrialBalanceRow[]> {
    const asOfDate = this.normalizeAsOf(asOf);
    try {
      const rows = await this.dataSource.query(
        `
        SELECT
          ga.account_code AS "accountCode",
          ga.account_name AS "accountName",
          ga.account_type AS "accountType",
          ga.normal_balance AS "normalBalance",
          ga.currency AS "currency",
          COALESCE(
            SUM(
              CASE
                WHEN gp.entry_type = ga.normal_balance THEN gp.amount_minor::numeric
                ELSE -gp.amount_minor::numeric
              END
            ),
            0
          )::bigint AS "balanceMinor"
        FROM gl_accounts ga
        LEFT JOIN gl_postings gp
          ON gp.gl_account_code = ga.account_code
         AND gp.value_date <= $1
        WHERE ga.is_active = true
        GROUP BY ga.account_code, ga.account_name, ga.account_type, ga.normal_balance, ga.currency
        ORDER BY ga.account_code ASC
        `,
        [asOfDate]
      );
      return rows as TrialBalanceRow[];
    } catch (error) {
      throw new InternalServerErrorException(
        error instanceof Error ? error.message : 'Unable to produce trial balance'
      );
    }
  }

  private toTrialBalanceLine(row: TrialBalanceRow) {
    const amount = BigInt(row.balanceMinor);
    let debit = 0n;
    let credit = 0n;
    if (row.normalBalance === GlNormalBalance.DEBIT) {
      debit = amount >= 0n ? amount : -amount;
      credit = amount >= 0n ? 0n : -amount;
    } else {
      credit = amount >= 0n ? amount : -amount;
      debit = amount >= 0n ? 0n : -amount;
    }

    return {
      account_code: row.accountCode,
      account_name: row.accountName,
      account_type: row.accountType,
      normal_balance: row.normalBalance,
      currency: row.currency,
      balance_minor: amount.toString(),
      debit_balance_minor: debit.toString(),
      credit_balance_minor: credit.toString()
    };
  }

  private toAmountLine(row: TrialBalanceRow) {
    return {
      account_code: row.accountCode,
      account_name: row.accountName,
      amount_minor: this.asPositive(row.balanceMinor).toString()
    };
  }

  private sumLines(lines: Array<{ amount_minor: string }>) {
    return lines
      .reduce((sum, line) => sum + BigInt(line.amount_minor), 0n)
      .toString();
  }

  private asPositive(value: string) {
    const parsed = BigInt(value);
    return parsed >= 0n ? parsed : -parsed;
  }
}
