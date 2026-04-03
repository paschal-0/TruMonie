import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpStatus,
  Injectable,
  NotFoundException,
  OnModuleInit
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomInt } from 'crypto';
import { Between, Repository } from 'typeorm';

import { Account } from '../ledger/entities/account.entity';
import { AccountStatus } from '../ledger/enums/account-status.enum';
import { AccountType } from '../ledger/enums/account-type.enum';
import { Currency } from '../ledger/enums/currency.enum';
import { LedgerService } from '../ledger/ledger.service';
import { NotificationsService } from '../notifications/notifications.service';
import { User, UserStatus } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { AgencyErrorCode, AgencyException } from './agency.errors';
import { AdminUpdateAgentStatusDto } from './dto/admin-update-agent-status.dto';
import { AgentCashInDto } from './dto/agent-cash-in.dto';
import { AgentCashOutDto } from './dto/agent-cash-out.dto';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentWalletConfigDto } from './dto/update-agent-wallet-config.dto';
import { AgentCommission, AgentCommissionStatus } from './entities/agent-commission.entity';
import { AgentExclusivity, AgentExclusivityStatus } from './entities/agent-exclusivity.entity';
import {
  AgentLimit,
  AgentLimitAppliesTo,
  AgentLimitPeriod,
  AgentLimitType
} from './entities/agent-limit.entity';
import { Agent, AgentStatus, AgentTier } from './entities/agent.entity';
import {
  AgentTransaction,
  AgentTransactionStatus,
  AgentTransactionType
} from './entities/agent-transaction.entity';
import { AgentWalletConfig } from './entities/agent-wallet-config.entity';

interface AgentContext {
  agent: Agent;
  wallet: Account;
  walletConfig: AgentWalletConfig | null;
  exclusivity: AgentExclusivity | null;
}

interface Aggregates {
  count: number;
  amountMinor: bigint;
  commissionMinor: bigint;
  lastTransactionAt: Date | null;
}

@Injectable()
export class AgencyService implements OnModuleInit {
  constructor(
    @InjectRepository(Agent)
    private readonly agentRepo: Repository<Agent>,
    @InjectRepository(AgentExclusivity)
    private readonly exclusivityRepo: Repository<AgentExclusivity>,
    @InjectRepository(AgentWalletConfig)
    private readonly walletConfigRepo: Repository<AgentWalletConfig>,
    @InjectRepository(AgentLimit)
    private readonly limitRepo: Repository<AgentLimit>,
    @InjectRepository(AgentTransaction)
    private readonly txRepo: Repository<AgentTransaction>,
    @InjectRepository(AgentCommission)
    private readonly commissionRepo: Repository<AgentCommission>,
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly ledgerService: LedgerService,
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService
  ) {}

  async onModuleInit() {
    await this.ensureDefaultLimits();
  }

  async onboard(ownerUserId: string, dto: CreateAgentDto) {
    const existingByOwner = await this.agentRepo.findOne({
      where: { ownerUserId },
      order: { createdAt: 'DESC' }
    });
    if (existingByOwner && existingByOwner.status !== AgentStatus.TERMINATED) {
      throw new ConflictException('Agent profile already exists for this user');
    }

    const wallet = await this.createAgentWallet(ownerUserId, dto.business_name);
    const agent = await this.agentRepo.save(
      this.agentRepo.create({
        ownerUserId,
        agentCode: await this.generateAgentCode(),
        businessName: dto.business_name.trim(),
        businessAddress: {
          street: dto.business_address.street.trim(),
          city: dto.business_address.city.trim(),
          state: dto.business_address.state.trim(),
          country: (dto.business_address.country ?? 'NG').trim()
        },
        geoLocation: {
          lat: dto.geo_location.lat,
          lng: dto.geo_location.lng
        },
        agentType: dto.agent_type,
        principalId: dto.principal_id,
        superAgentId: dto.super_agent_id,
        walletId: wallet.id,
        status: AgentStatus.PENDING,
        tier: AgentTier.BASIC,
        certifiedAt: null,
        suspendedAt: null,
        suspendedReason: null
      })
    );

    await this.exclusivityRepo.save(
      this.exclusivityRepo.create({
        agentId: agent.id,
        principalId: dto.principal_id,
        superAgentId: dto.super_agent_id,
        effectiveDate: '2026-04-01',
        status: AgentExclusivityStatus.ACTIVE,
        verifiedAt: null,
        verifiedBy: null
      })
    );

    const floatLimit = BigInt(dto.float_limit ?? 200_000_000); // ₦2,000,000
    const lowBalanceThreshold = BigInt(dto.low_balance_threshold ?? 2_000_000); // ₦20,000
    await this.walletConfigRepo.save(
      this.walletConfigRepo.create({
        walletId: wallet.id,
        agentId: agent.id,
        floatLimit: floatLimit.toString(),
        lowBalanceThreshold: lowBalanceThreshold.toString(),
        autoFundEnabled: dto.auto_fund_enabled ?? false,
        autoFundSource: null,
        autoFundAmount: null
      })
    );

    await this.notificationsService.send(
      ownerUserId,
      'AGENT_ONBOARDING_SUBMITTED',
      `Agent onboarding submitted for ${agent.businessName}.`
    );
    return this.getMyAgent(ownerUserId);
  }

  async getMyAgent(ownerUserId: string) {
    const context = await this.getAgentContextByOwner(ownerUserId);
    if (!context) return null;
    return this.toAgentPayload(context);
  }

  async updateMyWalletConfig(ownerUserId: string, dto: UpdateAgentWalletConfigDto) {
    const context = await this.requireAgentByOwner(ownerUserId);
    const config = context.walletConfig;
    if (!config) {
      throw new NotFoundException('Agent wallet config not found');
    }

    if (dto.float_limit !== undefined) config.floatLimit = `${dto.float_limit}`;
    if (dto.low_balance_threshold !== undefined) {
      config.lowBalanceThreshold = `${dto.low_balance_threshold}`;
    }
    if (dto.auto_fund_enabled !== undefined) config.autoFundEnabled = dto.auto_fund_enabled;
    if (dto.auto_fund_source !== undefined) config.autoFundSource = dto.auto_fund_source;
    if (dto.auto_fund_amount !== undefined) config.autoFundAmount = `${dto.auto_fund_amount}`;
    await this.walletConfigRepo.save(config);

    return this.getMyAgent(ownerUserId);
  }

  async cashIn(ownerUserId: string, dto: AgentCashInDto) {
    const existing = await this.txRepo.findOne({ where: { idempotencyKey: dto.idempotency_key } });
    if (existing) return this.toTransactionResponse(existing);

    const context = await this.requireSpecificAgentByOwner(ownerUserId, dto.agent_id);
    await this.usersService.assertValidTransactionPin(ownerUserId, dto.agent_pin);
    this.assertAgentCanTransact(context);
    this.assertExclusivity(context, dto.principal_id);

    const customerWallet = await this.requireCustomerWallet(dto.customer_account);
    if (context.wallet.type !== AccountType.AGENT) {
      throw new AgencyException(
        AgencyErrorCode.PERSONAL_ACCOUNT_USED,
        'Personal account used for agent transaction',
        HttpStatus.FORBIDDEN
      );
    }

    const amountMinor = BigInt(dto.amount);
    const commissionMinor = this.calculateCommission(AgentTransactionType.CASH_IN, amountMinor);
    await this.assertSingleTransactionLimit(amountMinor);
    await this.assertCustomerLimits(customerWallet.userId!, amountMinor, AgentTransactionType.CASH_IN);
    await this.assertAgentWalletLiquidity(context.wallet, amountMinor);

    const reference = this.buildReference('AGT-CI');
    await this.ledgerService.transfer({
      sourceAccountId: context.wallet.id,
      destinationAccountId: customerWallet.id,
      amountMinor: amountMinor.toString(),
      currency: Currency.NGN,
      description: `Agent cash-in ${reference}`,
      idempotencyKey: `AGT-CI-MOV-${dto.idempotency_key}`
    });

    const commissionStatus = await this.settleCommissionIfConfigured(
      context.wallet.id,
      commissionMinor,
      `Agent cash-in commission ${reference}`,
      `AGT-CI-COM-${dto.idempotency_key}`
    );

    const tx = await this.txRepo.save(
      this.txRepo.create({
        agentId: context.agent.id,
        reference,
        idempotencyKey: dto.idempotency_key,
        customerUserId: customerWallet.userId,
        customerWalletId: customerWallet.id,
        type: AgentTransactionType.CASH_IN,
        status: AgentTransactionStatus.SUCCESS,
        amountMinor: amountMinor.toString(),
        commissionMinor: commissionMinor.toString(),
        currency: Currency.NGN,
        metadata: {
          customer_account: dto.customer_account,
          principal_id: dto.principal_id
        },
        postedAt: new Date()
      })
    );

    await this.recordCommission(context.agent.id, tx, amountMinor, commissionMinor, commissionStatus);

    const refreshedWallet = await this.accountRepo.findOne({ where: { id: context.wallet.id } });
    const customer = await this.userRepo.findOne({ where: { id: customerWallet.userId! } });
    await this.notificationsService.send(
      ownerUserId,
      'AGENT_CASH_IN_SUCCESS',
      `Cash-in ${reference} successful.`
    );
    if (customer?.id) {
      await this.notificationsService.send(
        customer.id,
        'AGENT_CASH_IN_SUCCESS',
        `Your wallet has been funded by an agent. Ref: ${reference}.`
      );
    }

    return {
      transaction_id: tx.id,
      reference: tx.reference,
      status: tx.status,
      amount: Number(tx.amountMinor),
      commission: Number(tx.commissionMinor),
      agent_balance: Number(refreshedWallet?.balanceMinor ?? context.wallet.balanceMinor),
      customer_name: customer ? `${customer.firstName} ${customer.lastName}`.trim() : 'CUSTOMER'
    };
  }

  async cashOut(ownerUserId: string, dto: AgentCashOutDto) {
    const existing = await this.txRepo.findOne({ where: { idempotencyKey: dto.idempotency_key } });
    if (existing) return this.toTransactionResponse(existing);

    const context = await this.requireSpecificAgentByOwner(ownerUserId, dto.agent_id);
    await this.usersService.assertValidTransactionPin(ownerUserId, dto.agent_pin);
    this.assertAgentCanTransact(context);
    this.assertExclusivity(context, dto.principal_id);

    if (context.wallet.type !== AccountType.AGENT) {
      throw new AgencyException(
        AgencyErrorCode.PERSONAL_ACCOUNT_USED,
        'Personal account used for agent transaction',
        HttpStatus.FORBIDDEN
      );
    }

    const customerWallet = await this.requireCustomerWallet(dto.customer_account);
    await this.usersService.assertValidTransactionPin(customerWallet.userId!, dto.customer_pin);

    const amountMinor = BigInt(dto.amount);
    const commissionMinor = this.calculateCommission(AgentTransactionType.CASH_OUT, amountMinor);
    await this.assertSingleTransactionLimit(amountMinor);
    await this.assertCustomerLimits(customerWallet.userId!, amountMinor, AgentTransactionType.CASH_OUT);
    await this.assertAgentDailyCashOutLimit(context.agent.id, amountMinor);

    const reference = this.buildReference('AGT-CO');
    await this.ledgerService.transfer({
      sourceAccountId: customerWallet.id,
      destinationAccountId: context.wallet.id,
      amountMinor: amountMinor.toString(),
      currency: Currency.NGN,
      description: `Agent cash-out ${reference}`,
      idempotencyKey: `AGT-CO-MOV-${dto.idempotency_key}`
    });

    const commissionStatus = await this.settleCommissionIfConfigured(
      context.wallet.id,
      commissionMinor,
      `Agent cash-out commission ${reference}`,
      `AGT-CO-COM-${dto.idempotency_key}`
    );

    const tx = await this.txRepo.save(
      this.txRepo.create({
        agentId: context.agent.id,
        reference,
        idempotencyKey: dto.idempotency_key,
        customerUserId: customerWallet.userId,
        customerWalletId: customerWallet.id,
        type: AgentTransactionType.CASH_OUT,
        status: AgentTransactionStatus.SUCCESS,
        amountMinor: amountMinor.toString(),
        commissionMinor: commissionMinor.toString(),
        currency: Currency.NGN,
        metadata: {
          customer_account: dto.customer_account,
          principal_id: dto.principal_id
        },
        postedAt: new Date()
      })
    );

    await this.recordCommission(context.agent.id, tx, amountMinor, commissionMinor, commissionStatus);

    const refreshedWallet = await this.accountRepo.findOne({ where: { id: context.wallet.id } });
    const customer = await this.userRepo.findOne({ where: { id: customerWallet.userId! } });
    await this.notificationsService.send(
      ownerUserId,
      'AGENT_CASH_OUT_SUCCESS',
      `Cash-out ${reference} successful.`
    );
    if (customer?.id) {
      await this.notificationsService.send(
        customer.id,
        'AGENT_CASH_OUT_SUCCESS',
        `Your wallet was debited through an agent cash-out. Ref: ${reference}.`
      );
    }

    return {
      transaction_id: tx.id,
      reference: tx.reference,
      status: tx.status,
      amount: Number(tx.amountMinor),
      commission: Number(tx.commissionMinor),
      agent_balance: Number(refreshedWallet?.balanceMinor ?? context.wallet.balanceMinor)
    };
  }

  async getMyMetrics(ownerUserId: string) {
    const context = await this.requireAgentByOwner(ownerUserId);
    const now = new Date();
    const [todayStart, todayEnd] = this.dayWindow(now);
    const [weekStart, weekEnd] = this.weekWindow(now);

    const [todayRows, weekRows, todayCommissions, weekCommissions] = await Promise.all([
      this.txRepo.find({
        where: {
          agentId: context.agent.id,
          postedAt: Between(todayStart, todayEnd),
          status: AgentTransactionStatus.SUCCESS
        }
      }),
      this.txRepo.find({
        where: {
          agentId: context.agent.id,
          postedAt: Between(weekStart, weekEnd),
          status: AgentTransactionStatus.SUCCESS
        }
      }),
      this.commissionRepo.find({
        where: {
          agentId: context.agent.id,
          createdAt: Between(todayStart, todayEnd)
        }
      }),
      this.commissionRepo.find({
        where: {
          agentId: context.agent.id,
          createdAt: Between(weekStart, weekEnd)
        }
      })
    ]);

    const todayCashIn = this.aggregateByType(todayRows, AgentTransactionType.CASH_IN);
    const todayCashOut = this.aggregateByType(todayRows, AgentTransactionType.CASH_OUT);
    const weekAll = this.aggregateRows(weekRows);
    const todayCommission = todayCommissions.reduce(
      (sum, row) => sum + BigInt(row.commissionAmount),
      0n
    );
    const weekCommission = weekCommissions.reduce(
      (sum, row) => sum + BigInt(row.commissionAmount),
      0n
    );
    const dailyCashOutCap = await this.limitAmount(
      AgentLimitType.CUMULATIVE_CASH_OUT,
      AgentLimitAppliesTo.AGENT
    );
    const remainingCashOut = dailyCashOutCap - todayCashOut.amountMinor;
    const lowThreshold = BigInt(context.walletConfig?.lowBalanceThreshold ?? '2000000');
    const walletBalance = BigInt(context.wallet.balanceMinor);

    return {
      agent_id: context.agent.id,
      agent_code: context.agent.agentCode,
      wallet_balance: Number(context.wallet.balanceMinor),
      low_balance_alert: walletBalance < lowThreshold,
      today: {
        cash_in_count: todayCashIn.count,
        cash_in_total: Number(todayCashIn.amountMinor),
        cash_out_count: todayCashOut.count,
        cash_out_total: Number(todayCashOut.amountMinor),
        remaining_cash_out_limit: Number(remainingCashOut > 0n ? remainingCashOut : 0n),
        commission_earned: Number(todayCommission)
      },
      this_week: {
        total_transactions: weekAll.count,
        total_volume: Number(weekAll.amountMinor),
        total_commission: Number(weekCommission)
      },
      performance_score: this.performanceScore(weekAll),
      uptime_percentage: context.agent.status === AgentStatus.ACTIVE ? 99.0 : 95.0,
      last_transaction_at: weekAll.lastTransactionAt?.toISOString() ?? null
    };
  }

  async listMyTransactions(ownerUserId: string, limit = 50) {
    const context = await this.requireAgentByOwner(ownerUserId);
    const rows = await this.txRepo.find({
      where: { agentId: context.agent.id },
      order: { postedAt: 'DESC' },
      take: Math.min(200, Math.max(1, limit))
    });
    return {
      transactions: rows.map((row) => ({
        id: row.id,
        reference: row.reference,
        type: row.type,
        status: row.status,
        amount_minor: Number(row.amountMinor),
        commission_minor: Number(row.commissionMinor),
        currency: row.currency,
        metadata: row.metadata,
        posted_at: row.postedAt
      }))
    };
  }

  async listMyCommissions(ownerUserId: string, limit = 50) {
    const context = await this.requireAgentByOwner(ownerUserId);
    const rows = await this.commissionRepo.find({
      where: { agentId: context.agent.id },
      order: { createdAt: 'DESC' },
      take: Math.min(200, Math.max(1, limit))
    });
    return {
      commissions: rows.map((row) => ({
        id: row.id,
        transaction_id: row.transactionId,
        transaction_type: row.transactionType,
        transaction_amount: Number(row.transactionAmount),
        commission_amount: Number(row.commissionAmount),
        rate: Number(row.rate),
        status: row.status,
        settled_at: row.settledAt,
        created_at: row.createdAt
      }))
    };
  }

  async adminOverview() {
    const [total, pending, active, suspended] = await Promise.all([
      this.agentRepo.count(),
      this.agentRepo.count({ where: { status: AgentStatus.PENDING } }),
      this.agentRepo.count({ where: { status: AgentStatus.ACTIVE } }),
      this.agentRepo.count({ where: { status: AgentStatus.SUSPENDED } })
    ]);

    const now = new Date();
    const [todayStart, todayEnd] = this.dayWindow(now);
    const txRows = await this.txRepo.find({
      where: {
        postedAt: Between(todayStart, todayEnd),
        status: AgentTransactionStatus.SUCCESS
      }
    });

    const totalVolumeMinor = txRows.reduce((sum, row) => sum + BigInt(row.amountMinor), 0n);
    const totalCommissionsMinor = txRows.reduce(
      (sum, row) => sum + BigInt(row.commissionMinor),
      0n
    );

    return {
      agents: {
        total,
        pending,
        active,
        suspended
      },
      today: {
        transactions: txRows.length,
        total_volume_minor: Number(totalVolumeMinor),
        total_commission_minor: Number(totalCommissionsMinor)
      }
    };
  }

  async adminGetAgent(agentId: string) {
    const context = await this.getAgentContextById(agentId);
    if (!context) {
      throw new NotFoundException('Agent not found');
    }
    return this.toAgentPayload(context);
  }

  async adminUpdateStatus(adminUserId: string, agentId: string, dto: AdminUpdateAgentStatusDto) {
    const context = await this.getAgentContextById(agentId);
    if (!context) throw new NotFoundException('Agent not found');

    context.agent.status = dto.status;
    if (dto.status === AgentStatus.ACTIVE) {
      context.agent.certifiedAt = new Date();
      context.agent.suspendedAt = null;
      context.agent.suspendedReason = null;
      if (context.exclusivity && !context.exclusivity.verifiedAt) {
        context.exclusivity.verifiedAt = new Date();
        context.exclusivity.verifiedBy = adminUserId;
        await this.exclusivityRepo.save(context.exclusivity);
      }
    }
    if (dto.status === AgentStatus.SUSPENDED) {
      context.agent.suspendedAt = new Date();
      context.agent.suspendedReason = dto.reason?.trim() || 'Suspended by admin';
    }
    if (dto.status === AgentStatus.TERMINATED) {
      context.agent.suspendedAt = new Date();
      context.agent.suspendedReason = dto.reason?.trim() || 'Terminated by admin';
      if (context.exclusivity) {
        context.exclusivity.status = AgentExclusivityStatus.INACTIVE;
        await this.exclusivityRepo.save(context.exclusivity);
      }
    }
    await this.agentRepo.save(context.agent);

    await this.notificationsService.send(
      context.agent.ownerUserId,
      'AGENT_STATUS_UPDATED',
      `Agent status updated to ${dto.status}.`
    );

    return this.toAgentPayload(context);
  }

  private async createAgentWallet(ownerUserId: string, businessName: string) {
    const existing = await this.accountRepo.findOne({
      where: {
        userId: ownerUserId,
        type: AccountType.AGENT,
        currency: Currency.NGN
      }
    });
    if (existing) return existing;

    const wallet = this.accountRepo.create({
      userId: ownerUserId,
      currency: Currency.NGN,
      type: AccountType.AGENT,
      status: AccountStatus.ACTIVE,
      balanceMinor: '0',
      availableBalanceMinor: '0',
      ledgerBalanceMinor: '0',
      tier: 0,
      dailyLimitMinor: '0',
      maxBalanceMinor: null,
      frozenReason: null,
      frozenAt: null,
      label: `${businessName} Agent Wallet`,
      accountNumber: null
    });
    return this.accountRepo.save(wallet);
  }

  private async settleCommissionIfConfigured(
    destinationWalletId: string,
    commissionMinor: bigint,
    description: string,
    idempotencyKey: string
  ): Promise<AgentCommissionStatus> {
    if (commissionMinor <= 0n) return AgentCommissionStatus.SETTLED;
    const fees = this.configService.get<Record<string, string | undefined>>('systemAccounts.fees');
    const source = fees?.[Currency.NGN];
    if (!source) return AgentCommissionStatus.PENDING;

    await this.ledgerService.transfer({
      sourceAccountId: source,
      destinationAccountId: destinationWalletId,
      amountMinor: commissionMinor.toString(),
      currency: Currency.NGN,
      description,
      idempotencyKey
    });
    return AgentCommissionStatus.SETTLED;
  }

  private async recordCommission(
    agentId: string,
    tx: AgentTransaction,
    amountMinor: bigint,
    commissionMinor: bigint,
    status: AgentCommissionStatus
  ) {
    if (commissionMinor <= 0n) return;
    await this.commissionRepo.save(
      this.commissionRepo.create({
        agentId,
        transactionId: tx.id,
        transactionType: tx.type,
        transactionAmount: amountMinor.toString(),
        commissionAmount: commissionMinor.toString(),
        rate: '0.0010',
        status,
        settledAt: status === AgentCommissionStatus.SETTLED ? new Date() : null
      })
    );
  }

  private calculateCommission(type: AgentTransactionType, amountMinor: bigint) {
    if (type === AgentTransactionType.CASH_IN || type === AgentTransactionType.CASH_OUT) {
      const commission = (amountMinor * 10n) / 10_000n; // 0.10%
      const cap = 10_000n; // ₦100
      return commission > cap ? cap : commission;
    }
    if (type === AgentTransactionType.BILL_PAYMENT) return 2_000n; // ₦20 flat
    if (type === AgentTransactionType.ACCOUNT_OPENING) return 5_000n; // ₦50 flat
    return 0n;
  }

  private async requireCustomerWallet(accountNumber: string) {
    const wallet = await this.accountRepo.findOne({
      where: {
        accountNumber,
        type: AccountType.WALLET_MAIN,
        currency: Currency.NGN
      }
    });
    if (!wallet || !wallet.userId) {
      throw new NotFoundException('Customer account not found');
    }
    const customer = await this.userRepo.findOne({ where: { id: wallet.userId } });
    if (!customer || customer.status === UserStatus.DISABLED) {
      throw new ForbiddenException('Customer account is not active');
    }
    return wallet;
  }

  private assertAgentCanTransact(context: AgentContext) {
    if (
      context.agent.status === AgentStatus.SUSPENDED ||
      context.agent.status === AgentStatus.TERMINATED
    ) {
      throw new AgencyException(
        AgencyErrorCode.AGENT_SUSPENDED,
        'Agent suspended',
        HttpStatus.FORBIDDEN
      );
    }
    if (context.wallet.frozenAt || context.wallet.status !== AccountStatus.ACTIVE) {
      throw new AgencyException(
        AgencyErrorCode.AGENT_SUSPENDED,
        'Agent wallet is inactive',
        HttpStatus.FORBIDDEN
      );
    }
  }

  private assertExclusivity(context: AgentContext, principalId: string) {
    if (!context.exclusivity || context.exclusivity.status !== AgentExclusivityStatus.ACTIVE) return;
    if (context.exclusivity.principalId !== principalId) {
      throw new AgencyException(
        AgencyErrorCode.AGENT_EXCLUSIVITY_VIOLATION,
        'Agent is bound to a different Principal',
        HttpStatus.FORBIDDEN,
        { bound_principal: context.exclusivity.principalId }
      );
    }
  }

  private async assertSingleTransactionLimit(amountMinor: bigint) {
    const max = await this.limitAmount(AgentLimitType.SINGLE_TXN, AgentLimitAppliesTo.CUSTOMER);
    if (amountMinor > max) {
      throw new AgencyException(
        AgencyErrorCode.SINGLE_TRANSACTION_LIMIT_EXCEEDED,
        'Single transaction limit exceeded'
      );
    }
  }

  private async assertCustomerLimits(
    customerUserId: string,
    amountMinor: bigint,
    type: AgentTransactionType
  ) {
    const now = new Date();
    const [dayStart, dayEnd] = this.dayWindow(now);
    const [weekStart, weekEnd] = this.weekWindow(now);
    const [dailyRows, weeklyRows] = await Promise.all([
      this.txRepo.find({
        where: {
          customerUserId,
          type,
          status: AgentTransactionStatus.SUCCESS,
          postedAt: Between(dayStart, dayEnd)
        }
      }),
      this.txRepo.find({
        where: {
          customerUserId,
          status: AgentTransactionStatus.SUCCESS,
          postedAt: Between(weekStart, weekEnd)
        }
      })
    ]);

    const dailyAmount = dailyRows.reduce((sum, row) => sum + BigInt(row.amountMinor), 0n);
    const weeklyAmount = weeklyRows.reduce((sum, row) => sum + BigInt(row.amountMinor), 0n);
    const dailyLimitType =
      type === AgentTransactionType.CASH_IN ? AgentLimitType.CASH_IN : AgentLimitType.CASH_OUT;
    const dailyLimit = await this.limitAmount(dailyLimitType, AgentLimitAppliesTo.CUSTOMER);
    const weeklyLimit = await this.limitAmount(AgentLimitType.TOTAL, AgentLimitAppliesTo.CUSTOMER);

    if (dailyAmount + amountMinor > dailyLimit) {
      throw new AgencyException(
        AgencyErrorCode.CUSTOMER_DAILY_LIMIT_EXCEEDED,
        'Customer daily limit exceeded'
      );
    }
    if (weeklyAmount + amountMinor > weeklyLimit) {
      throw new AgencyException(
        AgencyErrorCode.CUSTOMER_WEEKLY_LIMIT_EXCEEDED,
        'Customer weekly limit exceeded'
      );
    }
  }

  private async assertAgentDailyCashOutLimit(agentId: string, amountMinor: bigint) {
    const now = new Date();
    const [dayStart, dayEnd] = this.dayWindow(now);
    const rows = await this.txRepo.find({
      where: {
        agentId,
        type: AgentTransactionType.CASH_OUT,
        status: AgentTransactionStatus.SUCCESS,
        postedAt: Between(dayStart, dayEnd)
      }
    });
    const dailyCashOut = rows.reduce((sum, row) => sum + BigInt(row.amountMinor), 0n);
    const limit = await this.limitAmount(
      AgentLimitType.CUMULATIVE_CASH_OUT,
      AgentLimitAppliesTo.AGENT
    );
    if (dailyCashOut + amountMinor > limit) {
      throw new AgencyException(
        AgencyErrorCode.AGENT_DAILY_CASH_OUT_LIMIT_EXCEEDED,
        'Agent daily cash-out limit exceeded'
      );
    }
  }

  private async assertAgentWalletLiquidity(wallet: Account, amountMinor: bigint) {
    if (BigInt(wallet.balanceMinor) < amountMinor) {
      throw new AgencyException(
        AgencyErrorCode.INSUFFICIENT_AGENT_WALLET_BALANCE,
        'Insufficient agent wallet balance'
      );
    }
  }

  private async limitAmount(type: AgentLimitType, appliesTo: AgentLimitAppliesTo) {
    const today = this.isoDate(new Date());
    const row = await this.limitRepo
      .createQueryBuilder('l')
      .where('l.limitType = :type', { type })
      .andWhere('l.appliesTo = :appliesTo', { appliesTo })
      .andWhere('l.effectiveFrom <= :today', { today })
      .andWhere('(l.effectiveTo IS NULL OR l.effectiveTo >= :today)', { today })
      .orderBy('l.effectiveFrom', 'DESC')
      .getOne();
    if (!row) {
      throw new BadRequestException(`Agent limit not configured: ${type}/${appliesTo}`);
    }
    return BigInt(row.maxAmount);
  }

  private aggregateRows(rows: AgentTransaction[]): Aggregates {
    const amountMinor = rows.reduce((sum, row) => sum + BigInt(row.amountMinor), 0n);
    const commissionMinor = rows.reduce((sum, row) => sum + BigInt(row.commissionMinor), 0n);
    const last = rows.reduce<Date | null>(
      (acc, row) => (!acc || row.postedAt > acc ? row.postedAt : acc),
      null
    );
    return {
      count: rows.length,
      amountMinor,
      commissionMinor,
      lastTransactionAt: last
    };
  }

  private aggregateByType(rows: AgentTransaction[], type: AgentTransactionType): Aggregates {
    return this.aggregateRows(rows.filter((row) => row.type === type));
  }

  private performanceScore(week: Aggregates) {
    const volumeScore = Number(week.amountMinor > 0n ? week.amountMinor / 10_000_000n : 0n);
    const txScore = week.count;
    const commissionScore = Number(week.commissionMinor > 0n ? week.commissionMinor / 100_000n : 0n);
    return Math.max(
      0,
      Math.min(100, 40 + Math.min(25, volumeScore) + Math.min(25, txScore) + Math.min(10, commissionScore))
    );
  }

  private buildReference(prefix: 'AGT-CI' | 'AGT-CO') {
    const day = this.isoDate(new Date()).replace(/-/g, '');
    const suffix = randomInt(1, 1_000_000).toString().padStart(6, '0');
    return `${prefix}-${day}-${suffix}`;
  }

  private async requireAgentByOwner(ownerUserId: string) {
    const context = await this.getAgentContextByOwner(ownerUserId);
    if (!context) throw new NotFoundException('Agent profile not found');
    return context;
  }

  private async requireSpecificAgentByOwner(ownerUserId: string, agentId: string) {
    const context = await this.requireAgentByOwner(ownerUserId);
    if (context.agent.id !== agentId) {
      throw new ForbiddenException('Agent does not belong to current user');
    }
    return context;
  }

  private async getAgentContextByOwner(ownerUserId: string): Promise<AgentContext | null> {
    const agent = await this.agentRepo.findOne({
      where: { ownerUserId },
      order: { createdAt: 'DESC' }
    });
    if (!agent) return null;
    return this.getAgentContext(agent);
  }

  private async getAgentContextById(agentId: string): Promise<AgentContext | null> {
    const agent = await this.agentRepo.findOne({ where: { id: agentId } });
    if (!agent) return null;
    return this.getAgentContext(agent);
  }

  private async getAgentContext(agent: Agent): Promise<AgentContext> {
    const [wallet, walletConfig, exclusivity] = await Promise.all([
      this.accountRepo.findOne({ where: { id: agent.walletId } }),
      this.walletConfigRepo.findOne({ where: { agentId: agent.id } }),
      this.exclusivityRepo.findOne({
        where: {
          agentId: agent.id,
          status: AgentExclusivityStatus.ACTIVE
        },
        order: { createdAt: 'DESC' }
      })
    ]);
    if (!wallet) throw new NotFoundException('Agent wallet not found');
    return { agent, wallet, walletConfig, exclusivity };
  }

  private toAgentPayload(context: AgentContext) {
    const lowThreshold = BigInt(context.walletConfig?.lowBalanceThreshold ?? '0');
    const walletBalance = BigInt(context.wallet.balanceMinor);
    return {
      id: context.agent.id,
      owner_user_id: context.agent.ownerUserId,
      agent_code: context.agent.agentCode,
      business_name: context.agent.businessName,
      business_address: context.agent.businessAddress,
      geo_location: context.agent.geoLocation,
      agent_type: context.agent.agentType,
      principal_id: context.agent.principalId,
      super_agent_id: context.agent.superAgentId,
      wallet_id: context.agent.walletId,
      status: context.agent.status,
      tier: context.agent.tier,
      certified_at: context.agent.certifiedAt,
      suspended_at: context.agent.suspendedAt,
      suspended_reason: context.agent.suspendedReason,
      wallet: {
        id: context.wallet.id,
        balance_minor: Number(context.wallet.balanceMinor),
        available_balance_minor: Number(context.wallet.availableBalanceMinor),
        low_balance_alert: lowThreshold > 0n ? walletBalance < lowThreshold : false
      },
      exclusivity: context.exclusivity
        ? {
            principal_id: context.exclusivity.principalId,
            super_agent_id: context.exclusivity.superAgentId,
            effective_date: context.exclusivity.effectiveDate,
            status: context.exclusivity.status,
            verified_at: context.exclusivity.verifiedAt
          }
        : null,
      wallet_config: context.walletConfig
        ? {
            float_limit: Number(context.walletConfig.floatLimit),
            low_balance_threshold: Number(context.walletConfig.lowBalanceThreshold),
            auto_fund_enabled: context.walletConfig.autoFundEnabled,
            auto_fund_source: context.walletConfig.autoFundSource,
            auto_fund_amount: context.walletConfig.autoFundAmount
              ? Number(context.walletConfig.autoFundAmount)
              : null
          }
        : null,
      created_at: context.agent.createdAt,
      updated_at: context.agent.updatedAt
    };
  }

  private toTransactionResponse(tx: AgentTransaction) {
    return {
      transaction_id: tx.id,
      reference: tx.reference,
      status: tx.status,
      amount: Number(tx.amountMinor),
      commission: Number(tx.commissionMinor)
    };
  }

  private async generateAgentCode() {
    const day = this.isoDate(new Date()).replace(/-/g, '');
    for (let i = 0; i < 100; i += 1) {
      const suffix = randomInt(100, 999).toString();
      const candidate = `AGT-${day}-${suffix}`;
      const exists = await this.agentRepo.findOne({ where: { agentCode: candidate } });
      if (!exists) return candidate;
    }
    return `AGT-${day}-${randomInt(1000, 9999)}`;
  }

  private dayWindow(date: Date): [Date, Date] {
    const iso = this.isoDate(date);
    return [new Date(`${iso}T00:00:00.000Z`), new Date(`${iso}T23:59:59.999Z`)];
  }

  private weekWindow(date: Date): [Date, Date] {
    const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = utcDate.getUTCDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    utcDate.setUTCDate(utcDate.getUTCDate() + mondayOffset);
    const start = new Date(
      Date.UTC(utcDate.getUTCFullYear(), utcDate.getUTCMonth(), utcDate.getUTCDate(), 0, 0, 0, 0)
    );
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    end.setUTCHours(23, 59, 59, 999);
    return [start, end];
  }

  private isoDate(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private async ensureDefaultLimits() {
    const defaults: Array<{
      limitType: AgentLimitType;
      period: AgentLimitPeriod;
      maxAmount: string;
      appliesTo: AgentLimitAppliesTo;
    }> = [
      {
        limitType: AgentLimitType.CASH_IN,
        period: AgentLimitPeriod.DAILY,
        maxAmount: '10000000',
        appliesTo: AgentLimitAppliesTo.CUSTOMER
      },
      {
        limitType: AgentLimitType.CASH_OUT,
        period: AgentLimitPeriod.DAILY,
        maxAmount: '10000000',
        appliesTo: AgentLimitAppliesTo.CUSTOMER
      },
      {
        limitType: AgentLimitType.TOTAL,
        period: AgentLimitPeriod.WEEKLY,
        maxAmount: '50000000',
        appliesTo: AgentLimitAppliesTo.CUSTOMER
      },
      {
        limitType: AgentLimitType.CUMULATIVE_CASH_OUT,
        period: AgentLimitPeriod.DAILY,
        maxAmount: '120000000',
        appliesTo: AgentLimitAppliesTo.AGENT
      },
      {
        limitType: AgentLimitType.SINGLE_TXN,
        period: AgentLimitPeriod.TRANSACTION,
        maxAmount: '10000000',
        appliesTo: AgentLimitAppliesTo.CUSTOMER
      }
    ];

    const effectiveFrom = '2025-01-01';
    for (const item of defaults) {
      const existing = await this.limitRepo.findOne({
        where: {
          limitType: item.limitType,
          period: item.period,
          appliesTo: item.appliesTo,
          effectiveFrom
        }
      });
      if (existing) continue;
      await this.limitRepo.save(
        this.limitRepo.create({
          ...item,
          effectiveFrom,
          effectiveTo: null
        })
      );
    }
  }
}
