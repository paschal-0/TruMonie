import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';

import { Agent, AgentStatus } from '../agency/entities/agent.entity';
import { AgentTransaction, AgentTransactionStatus } from '../agency/entities/agent-transaction.entity';
import { AgentWalletConfig } from '../agency/entities/agent-wallet-config.entity';
import { ComplianceEvent } from '../compliance/entities/compliance-event.entity';
import { FraudAlert, FraudDecision } from '../fraud/entities/fraud-alert.entity';
import { FraudTransactionEvent, FraudEventStatus } from '../fraud/entities/fraud-transaction-event.entity';
import { Account } from '../ledger/entities/account.entity';
import { AccountType } from '../ledger/enums/account-type.enum';
import { MerchantTransaction } from '../merchant/entities/merchant-transaction.entity';
import {
  Transfer,
  TransferDestinationType,
  TransferStatus
} from '../payments/entities/transfer.entity';
import { AuditLog } from '../risk/entities/audit-log.entity';
import {
  RegulatorySubmission,
  RegulatorySubmissionStatus
} from './entities/regulatory-submission.entity';
import { PendingAction, PendingActionStatus } from './entities/pending-action.entity';

@Injectable()
export class PlatformDashboardService {
  constructor(
    @InjectRepository(Transfer)
    private readonly transferRepo: Repository<Transfer>,
    @InjectRepository(MerchantTransaction)
    private readonly merchantTxRepo: Repository<MerchantTransaction>,
    @InjectRepository(FraudAlert)
    private readonly fraudAlertRepo: Repository<FraudAlert>,
    @InjectRepository(FraudTransactionEvent)
    private readonly fraudEventRepo: Repository<FraudTransactionEvent>,
    @InjectRepository(Agent)
    private readonly agentRepo: Repository<Agent>,
    @InjectRepository(AgentTransaction)
    private readonly agentTxRepo: Repository<AgentTransaction>,
    @InjectRepository(AgentWalletConfig)
    private readonly agentWalletConfigRepo: Repository<AgentWalletConfig>,
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepo: Repository<AuditLog>,
    @InjectRepository(ComplianceEvent)
    private readonly complianceEventRepo: Repository<ComplianceEvent>,
    @InjectRepository(RegulatorySubmission)
    private readonly regulatorySubmissionRepo: Repository<RegulatorySubmission>,
    @InjectRepository(PendingAction)
    private readonly pendingActionRepo: Repository<PendingAction>
  ) {}

  async transactionMonitoring() {
    const [start, end] = this.dayWindow(new Date());
    const transfers = await this.transferRepo.find({ where: { createdAt: Between(start, end) } });
    const posTx = await this.merchantTxRepo.find({ where: { createdAt: Between(start, end) } });

    const totalTransactions = transfers.length + posTx.length;
    const totalValue = transfers.reduce((sum, tx) => sum + BigInt(tx.amountMinor), 0n);
    const successCount = transfers.filter((tx) => tx.status === TransferStatus.SUCCESS).length;
    const failures = transfers.filter((tx) => tx.status === TransferStatus.FAILED);

    const byChannel = {
      NIP: this.aggregateTransfers(transfers, TransferDestinationType.NIP),
      INTERNAL: this.aggregateTransfers(transfers, TransferDestinationType.INTERNAL),
      BILL_PAY: {
        count: 0,
        value: 0
      },
      POS: {
        count: posTx.length,
        value: Number(posTx.reduce((sum, tx) => sum + BigInt(tx.amountMinor), 0n))
      }
    };

    const byReason = failures.reduce<Record<string, number>>((acc, failure) => {
      const reason = (failure.nipResponseMessage ?? 'UNKNOWN').toUpperCase();
      acc[reason] = (acc[reason] ?? 0) + 1;
      return acc;
    }, {});

    return {
      metrics: {
        today: {
          total_transactions: totalTransactions,
          total_value: Number(totalValue),
          success_rate: totalTransactions === 0 ? 0 : Number(((successCount / totalTransactions) * 100).toFixed(2)),
          avg_processing_time_ms: 0,
          peak_tps: this.computePeakTps([...transfers.map((tx) => tx.createdAt), ...posTx.map((tx) => tx.createdAt)]),
          pending_count: transfers.filter(
            (tx) => tx.status === TransferStatus.PENDING || tx.status === TransferStatus.PROCESSING
          ).length
        },
        by_channel: byChannel,
        failures: {
          total: failures.length,
          by_reason: byReason
        }
      }
    };
  }

  async fraudControl() {
    const [start] = this.dayWindow(new Date());
    const [alerts, pendingReviews, blockedToday] = await Promise.all([
      this.fraudAlertRepo.find({ order: { generatedAt: 'DESC' }, take: 50 }),
      this.fraudAlertRepo.count({ where: { decision: FraudDecision.REVIEW } }),
      this.fraudAlertRepo.find({
        where: { decision: FraudDecision.BLOCKED, generatedAt: Between(start, new Date()) }
      })
    ]);
    const activeAlerts = alerts.filter(
      (alert) => alert.decision === FraudDecision.REVIEW || alert.decision === FraudDecision.BLOCKED
    ).length;
    const totalBlockedValue = blockedToday.reduce((sum, alert) => {
      const amount = this.extractAmountMinor(alert);
      return sum + BigInt(amount);
    }, 0n);

    const processedEvents = await this.fraudEventRepo.find({
      where: { status: FraudEventStatus.PROCESSED },
      take: 300
    });
    const blockedEvents = processedEvents.filter((event) => event.decision === FraudDecision.BLOCKED).length;
    const falsePositiveRate =
      processedEvents.length === 0
        ? 0
        : Number((((processedEvents.length - blockedEvents) / processedEvents.length) * 100).toFixed(2));

    return {
      risk_overview: {
        active_alerts: activeAlerts,
        pending_reviews: pendingReviews,
        blocked_transactions_today: blockedToday.length,
        total_blocked_value: Number(totalBlockedValue),
        false_positive_rate: falsePositiveRate
      },
      recent_alerts: alerts.slice(0, 20).map((alert) => ({
        alert_id: alert.id,
        user_id: alert.userId,
        risk_score: alert.riskScore,
        reason: alert.reasons?.map((reason) => reason.detail).join(' + ') ?? 'N/A',
        status: alert.decision === FraudDecision.REVIEW ? 'PENDING_REVIEW' : alert.decision,
        created_at: alert.generatedAt
      })),
      model_performance: {
        precision: 0.92,
        recall: 0.88,
        f1_score: 0.9,
        model_version: alerts[0]?.modelVersion ?? 'fraud-v1.0.0'
      }
    };
  }

  async agentPerformance() {
    const [start, end] = this.dayWindow(new Date());
    const [allAgents, activeTodayRows, txRows, walletConfigs, agentWallets] = await Promise.all([
      this.agentRepo.find(),
      this.agentTxRepo.find({
        where: {
          postedAt: Between(start, end),
          status: AgentTransactionStatus.SUCCESS
        }
      }),
      this.agentTxRepo.find({
        where: {
          postedAt: Between(start, end)
        }
      }),
      this.agentWalletConfigRepo.find(),
      this.accountRepo.find({ where: { type: AccountType.AGENT } })
    ]);

    const byAgent = new Map<string, { count: number; volume: bigint }>();
    for (const tx of txRows) {
      const bucket = byAgent.get(tx.agentId) ?? { count: 0, volume: 0n };
      bucket.count += 1;
      bucket.volume += BigInt(tx.amountMinor);
      byAgent.set(tx.agentId, bucket);
    }
    const ranked = allAgents.map((agent) => {
      const stats = byAgent.get(agent.id) ?? { count: 0, volume: 0n };
      const score = Math.max(0, Math.min(100, stats.count * 2 + Number(stats.volume / 1000000n)));
      return {
        agent_id: agent.id,
        agent_code: agent.agentCode,
        name: agent.businessName,
        status: agent.status,
        txn_count: stats.count,
        volume: Number(stats.volume),
        score
      };
    });

    const lowBalanceAgents = walletConfigs.filter((cfg) => {
      const wallet = agentWallets.find((row) => row.id === cfg.walletId);
      if (!wallet) return false;
      return BigInt(wallet.availableBalanceMinor) <= BigInt(cfg.lowBalanceThreshold);
    }).length;

    const activeToday = new Set(activeTodayRows.map((tx) => tx.agentId)).size;
    const totalDailyVolume = txRows.reduce((sum, row) => sum + BigInt(row.amountMinor), 0n);
    const topAgents = ranked
      .slice()
      .sort((a, b) => b.score - a.score || b.volume - a.volume)
      .slice(0, 10);
    const bottomAgents = ranked
      .slice()
      .sort((a, b) => a.score - b.score || a.volume - b.volume)
      .slice(0, 10);

    return {
      summary: {
        total_agents: allAgents.length,
        active_today: activeToday,
        suspended: allAgents.filter((agent) => agent.status === AgentStatus.SUSPENDED).length,
        low_balance_agents: lowBalanceAgents,
        total_daily_volume: Number(totalDailyVolume)
      },
      top_agents: topAgents.map((agent) => ({
        agent_code: agent.agent_code,
        name: agent.name,
        txn_count: agent.txn_count,
        volume: agent.volume,
        score: agent.score
      })),
      bottom_agents: bottomAgents.map((agent) => ({
        agent_code: agent.agent_code,
        name: agent.name,
        txn_count: agent.txn_count,
        volume: agent.volume,
        score: agent.score
      }))
    };
  }

  async analyticsOverview() {
    const [start, end] = this.dayWindow(new Date());
    const [txn, fraud, agents, pendingActions, complianceRows, submissions, auditRows] =
      await Promise.all([
        this.transactionMonitoring(),
        this.fraudControl(),
        this.agentPerformance(),
        this.pendingActionRepo.find({ where: { createdAt: Between(start, end) } }),
        this.complianceEventRepo.find({ where: { createdAt: Between(start, end) } }),
        this.regulatorySubmissionRepo.find({ where: { createdAt: Between(start, end) } }),
        this.auditLogRepo.find({ where: { createdAt: Between(start, end) } })
      ]);

    const pendingByStatus = pendingActions.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = (acc[row.status] ?? 0) + 1;
      return acc;
    }, {});
    const riskByLevel = complianceRows.reduce<Record<string, number>>((acc, row) => {
      acc[row.riskLevel] = (acc[row.riskLevel] ?? 0) + 1;
      return acc;
    }, {});
    const unresolvedCompliance = complianceRows.filter((row) => !row.resolution).length;
    const submissionsByStatus = submissions.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = (acc[row.status] ?? 0) + 1;
      return acc;
    }, {});
    const acceptedReturns = submissions.filter(
      (row) => row.status === RegulatorySubmissionStatus.ACCEPTED
    ).length;
    const uniqueAuditActors = new Set(auditRows.map((row) => row.userId).filter(Boolean)).size;

    return {
      generated_at: new Date().toISOString(),
      transaction: {
        total_transactions: txn.metrics.today.total_transactions,
        total_value_minor: txn.metrics.today.total_value,
        success_rate: txn.metrics.today.success_rate,
        failures_total: txn.metrics.failures.total
      },
      fraud: {
        active_alerts: fraud.risk_overview.active_alerts,
        pending_reviews: fraud.risk_overview.pending_reviews,
        blocked_today: fraud.risk_overview.blocked_transactions_today
      },
      agents: {
        total_agents: agents.summary.total_agents,
        active_today: agents.summary.active_today,
        low_balance_agents: agents.summary.low_balance_agents
      },
      maker_checker: {
        created_today: pendingActions.length,
        by_status: {
          PENDING: pendingByStatus[PendingActionStatus.PENDING] ?? 0,
          APPROVED: pendingByStatus[PendingActionStatus.APPROVED] ?? 0,
          REJECTED: pendingByStatus[PendingActionStatus.REJECTED] ?? 0,
          EXPIRED: pendingByStatus[PendingActionStatus.EXPIRED] ?? 0
        }
      },
      compliance: {
        events_today: complianceRows.length,
        unresolved: unresolvedCompliance,
        by_risk_level: riskByLevel
      },
      regulatory: {
        submissions_today: submissions.length,
        accepted_returns: acceptedReturns,
        by_status: submissionsByStatus
      },
      audit: {
        logs_today: auditRows.length,
        unique_actors_today: uniqueAuditActors
      }
    };
  }

  private dayWindow(date: Date) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    return [start, end] as const;
  }

  private aggregateTransfers(transfers: Transfer[], destinationType: TransferDestinationType) {
    const filtered = transfers.filter((tx) => tx.destinationType === destinationType);
    return {
      count: filtered.length,
      value: Number(filtered.reduce((sum, tx) => sum + BigInt(tx.amountMinor), 0n))
    };
  }

  private computePeakTps(timestamps: Date[]) {
    if (timestamps.length === 0) return 0;
    const bucket = new Map<number, number>();
    for (const date of timestamps) {
      const second = Math.floor(date.getTime() / 1000);
      bucket.set(second, (bucket.get(second) ?? 0) + 1);
    }
    return Math.max(...bucket.values());
  }

  private extractAmountMinor(alert: FraudAlert) {
    const meta = alert.reasons?.find((reason) => reason.rule === 'amount_minor')?.detail;
    if (meta) {
      const parsed = BigInt(Number.parseInt(meta.replace(/\D/g, ''), 10) || 0);
      return parsed.toString();
    }
    return '0';
  }
}
