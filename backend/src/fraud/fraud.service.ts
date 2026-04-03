import {
  ForbiddenException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ComplianceService } from '../compliance/compliance.service';
import { ComplianceRiskLevel } from '../compliance/entities/compliance-event.entity';
import { Currency } from '../ledger/enums/currency.enum';
import { Transfer, TransferDestinationType } from '../payments/entities/transfer.entity';
import { SecurityErrorCode, SecurityException } from '../security/security.errors';
import { FraudEngineService } from './fraud-engine.service';
import { FraudAlert, FraudDecision } from './entities/fraud-alert.entity';
import { FraudEventStatus, FraudTransactionEvent } from './entities/fraud-transaction-event.entity';
import { FraudReport, FraudReportStatus, FraudReportType } from './entities/fraud-report.entity';

export interface TransferRiskInput {
  userId: string;
  amountMinor: string;
  sourceBalanceMinor?: string;
  destinationType: TransferDestinationType;
  destinationAccount?: string;
  destinationBank?: string;
  transactionReference?: string;
}

@Injectable()
export class FraudService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FraudService.name);
  private readonly reportTickerMs: number;
  private readonly eventProcessorTickerMs: number;
  private readonly eventBatchSize: number;
  private readonly modelVersion: string;
  private readonly nfiuEscalationEnabled: boolean;
  private reportTimer: ReturnType<typeof setInterval> | null = null;
  private eventTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(FraudReport)
    private readonly fraudReportRepo: Repository<FraudReport>,
    @InjectRepository(FraudAlert)
    private readonly fraudAlertRepo: Repository<FraudAlert>,
    @InjectRepository(FraudTransactionEvent)
    private readonly fraudEventRepo: Repository<FraudTransactionEvent>,
    @InjectRepository(Transfer)
    private readonly transferRepo: Repository<Transfer>,
    private readonly fraudEngine: FraudEngineService,
    private readonly complianceService: ComplianceService
  ) {
    this.reportTickerMs = this.configService.get<number>('fraud.reportSchedulerIntervalMs', 60_000);
    this.eventProcessorTickerMs = this.configService.get<number>('fraud.eventProcessorIntervalMs', 15_000);
    this.eventBatchSize = this.configService.get<number>('fraud.eventBatchSize', 100);
    this.modelVersion = this.configService.get<string>('fraud.modelVersion', 'fraud-v1.0.0');
    this.nfiuEscalationEnabled = this.configService.get<boolean>('fraud.nfiuEscalationEnabled', true);
  }

  onModuleInit() {
    this.reportTimer = setInterval(() => {
      void this.processDeadlines().catch((error) => {
        this.logger.error('Fraud deadline processing failed', error instanceof Error ? error.stack : '');
      });
    }, this.reportTickerMs);

    this.eventTimer = setInterval(() => {
      void this.processPendingEvents().catch((error) => {
        this.logger.error('Fraud event processing failed', error instanceof Error ? error.stack : '');
      });
    }, this.eventProcessorTickerMs);
  }

  onModuleDestroy() {
    if (this.reportTimer) clearInterval(this.reportTimer);
    if (this.eventTimer) clearInterval(this.eventTimer);
    this.reportTimer = null;
    this.eventTimer = null;
  }

  async createReport(params: {
    userId: string;
    transactionId: string;
    reportType: FraudReportType;
    description: string;
    reportedAmountMinor: string;
  }) {
    const transfer = await this.transferRepo.findOne({ where: { id: params.transactionId } });
    if (!transfer) {
      throw new NotFoundException('Transaction not found');
    }
    if (transfer.sourceUserId !== params.userId) {
      throw new ForbiddenException('You can only report your own transactions');
    }

    const existing = await this.fraudReportRepo.findOne({
      where: {
        userId: params.userId,
        transactionId: params.transactionId,
        reportType: params.reportType
      }
    });
    if (existing) {
      throw new SecurityException(
        SecurityErrorCode.TRANSACTION_ALREADY_REPORTED,
        'Transaction already reported',
        HttpStatus.BAD_REQUEST
      );
    }

    const now = new Date();
    const resolutionDeadline = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    const nfiuDueAt = new Date(now.getTime() + 72 * 60 * 60 * 1000);
    const report = await this.fraudReportRepo.save(
      this.fraudReportRepo.create({
        userId: params.userId,
        transactionId: params.transactionId,
        reportType: params.reportType,
        description: params.description,
        reportedAmountMinor: params.reportedAmountMinor,
        status: FraudReportStatus.RECEIVED,
        beneficiaryBankNotified: false,
        notificationSentAt: null,
        resolutionDeadlineAt: resolutionDeadline,
        nfiuReportDueAt: nfiuDueAt,
        nfiuReported: false,
        nfiuReportedAt: null,
        resolvedAt: null,
        metadata: {
          transferReference: transfer.reference,
          destinationBank: transfer.destinationBank
        }
      })
    );

    await this.notifyBeneficiaryBank(report.id);
    const refreshed = await this.fraudReportRepo.findOneOrFail({ where: { id: report.id } });
    await this.complianceService.emit({
      eventType: 'FRAUD_REPORT',
      referenceId: refreshed.id,
      userId: refreshed.userId,
      riskLevel: ComplianceRiskLevel.HIGH,
      details: {
        reportType: refreshed.reportType,
        transactionId: refreshed.transactionId,
        status: refreshed.status,
        notificationSentAt: refreshed.notificationSentAt?.toISOString() ?? null,
        resolutionDeadlineAt: refreshed.resolutionDeadlineAt.toISOString()
      }
    });

    return {
      code: SecurityErrorCode.FRAUD_REPORT_RECEIVED,
      report_id: refreshed.id,
      status: refreshed.status,
      beneficiary_bank_notified: refreshed.beneficiaryBankNotified,
      notification_sent_at: refreshed.notificationSentAt?.toISOString() ?? null,
      resolution_deadline: refreshed.resolutionDeadlineAt.toISOString()
    };
  }

  async listAlerts(params: { decision?: FraudDecision; limit?: number }) {
    return this.fraudAlertRepo.find({
      where: {
        ...(params.decision ? { decision: params.decision } : {})
      },
      order: { generatedAt: 'DESC' },
      take: Math.min(Math.max(params.limit ?? 50, 1), 200)
    });
  }

  async listEvents(params: { status?: FraudEventStatus; limit?: number }) {
    return this.fraudEventRepo.find({
      where: {
        ...(params.status ? { status: params.status } : {})
      },
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(params.limit ?? 50, 1), 200)
    });
  }

  async assessTransferRisk(input: TransferRiskInput) {
    const event = await this.enqueueTransactionEvent(input);
    return this.processEvent(event, true);
  }

  async processPendingEvents() {
    const pending = await this.fraudEventRepo.find({
      where: { status: FraudEventStatus.PENDING },
      order: { createdAt: 'ASC' },
      take: this.eventBatchSize
    });
    for (const event of pending) {
      await this.processEvent(event, false);
    }
  }

  async processDeadlines() {
    const now = new Date();
    const toNotify = await this.fraudReportRepo.find({
      where: {
        beneficiaryBankNotified: false,
        status: FraudReportStatus.RECEIVED
      },
      take: 100
    });
    for (const report of toNotify) {
      await this.notifyBeneficiaryBank(report.id);
    }

    await this.fraudReportRepo
      .createQueryBuilder()
      .update(FraudReport)
      .set({
        status: FraudReportStatus.INVESTIGATION_OVERDUE,
        metadata: () => `COALESCE(metadata, '{}'::jsonb) || '{"investigationOverdue": true}'::jsonb`
      })
      .where('status IN (:...statuses)', {
        statuses: [FraudReportStatus.RECEIVED, FraudReportStatus.BENEFICIARY_BANK_NOTIFIED]
      })
      .andWhere('resolution_deadline_at < :now', { now })
      .execute();

    if (this.nfiuEscalationEnabled) {
      const toEscalate = await this.fraudReportRepo.find({
        where: {
          nfiuReported: false
        }
      });
      await this.fraudReportRepo
        .createQueryBuilder()
        .update(FraudReport)
        .set({
          status: FraudReportStatus.ESCALATED_NFIU,
          nfiuReported: true,
          nfiuReportedAt: now,
          metadata: () => `COALESCE(metadata, '{}'::jsonb) || '{"nfiuAutoEscalated": true}'::jsonb`
        })
        .where('nfiu_reported = false')
        .andWhere('nfiu_report_due_at < :now', { now })
        .execute();
      for (const report of toEscalate) {
        if (report.nfiuReportDueAt >= now) continue;
        await this.complianceService.emit({
          eventType: 'THRESHOLD_BREACH',
          referenceId: report.id,
          userId: report.userId,
          riskLevel: ComplianceRiskLevel.CRITICAL,
          details: {
            reason: 'NFIU escalation deadline exceeded',
            reportType: report.reportType
          }
        });
      }
    }
  }

  private async enqueueTransactionEvent(input: TransferRiskInput) {
    return this.fraudEventRepo.save(
      this.fraudEventRepo.create({
        eventType: 'TRANSFER_INITIATED',
        sourceType: 'TRANSFER',
        userId: input.userId,
        transactionId: null,
        transactionReference: input.transactionReference ?? null,
        amountMinor: input.amountMinor,
        currency: Currency.NGN,
        destinationType: input.destinationType,
        destinationAccount: input.destinationAccount ?? null,
        destinationBank: input.destinationBank ?? null,
        sourceBalanceMinor: input.sourceBalanceMinor ?? null,
        metadata: null,
        status: FraudEventStatus.PENDING,
        processedAt: null,
        errorMessage: null,
        fraudAlertId: null,
        decision: null,
        riskScore: null
      })
    );
  }

  private async processEvent(event: FraudTransactionEvent, enforceBlocking: boolean) {
    try {
      const result = await this.fraudEngine.evaluate({
        userId: event.userId,
        amountMinor: event.amountMinor,
        sourceBalanceMinor: event.sourceBalanceMinor,
        destinationType: event.destinationType,
        destinationAccount: event.destinationAccount,
        destinationBank: event.destinationBank,
        transactionReference: event.transactionReference
      });

      const generatedAt = new Date();
      const alert = await this.fraudAlertRepo.save(
        this.fraudAlertRepo.create({
          userId: event.userId,
          transactionId: event.transactionId,
          transactionReference: event.transactionReference,
          riskScore: result.riskScore,
          decision: result.decision,
          reasons: result.reasons,
          modelVersion: result.modelVersion,
          featureImportances: result.featureImportances,
          recommendedAction: result.recommendedAction,
          generatedAt
        })
      );

      if (result.decision !== FraudDecision.ALLOW) {
        await this.complianceService.emit({
          eventType: 'SUSPICIOUS_TRANSACTION',
          referenceId: alert.id,
          userId: event.userId,
          riskLevel:
            result.decision === FraudDecision.BLOCKED
              ? ComplianceRiskLevel.CRITICAL
              : ComplianceRiskLevel.MEDIUM,
          details: {
            riskScore: result.riskScore,
            decision: result.decision,
            reasons: result.reasons,
            transactionReference: event.transactionReference ?? null
          }
        });
      }

      event.status = FraudEventStatus.PROCESSED;
      event.processedAt = new Date();
      event.errorMessage = null;
      event.fraudAlertId = alert.id;
      event.decision = result.decision;
      event.riskScore = result.riskScore;
      await this.fraudEventRepo.save(event);

      if (enforceBlocking && result.decision === FraudDecision.BLOCKED) {
        throw new SecurityException(
          SecurityErrorCode.TRANSACTION_BLOCKED_BY_FRAUD_ENGINE,
          'Transaction blocked by fraud engine',
          HttpStatus.FORBIDDEN,
          {
            alert_id: alert.id,
            risk_score: result.riskScore,
            decision: result.decision,
            reasons: result.reasons
          }
        );
      }

      return {
        alert_id: alert.id,
        risk_score: result.riskScore,
        decision: result.decision,
        reasons: result.reasons,
        model_version: this.modelVersion,
        feature_importances: result.featureImportances,
        recommended_action: result.recommendedAction,
        generated_at: generatedAt.toISOString()
      };
    } catch (error) {
      event.status = FraudEventStatus.FAILED;
      event.processedAt = new Date();
      event.errorMessage = error instanceof Error ? error.message : 'Unknown fraud engine error';
      await this.fraudEventRepo.save(event);

      if (error instanceof SecurityException) {
        throw error;
      }
      throw new SecurityException(
        SecurityErrorCode.FRAUD_ENGINE_UNAVAILABLE,
        'Fraud engine unavailable',
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }
  }

  private async notifyBeneficiaryBank(reportId: string) {
    const report = await this.fraudReportRepo.findOne({ where: { id: reportId } });
    if (!report || report.beneficiaryBankNotified) return;

    const now = new Date();
    report.beneficiaryBankNotified = true;
    report.notificationSentAt = now;
    report.status = FraudReportStatus.BENEFICIARY_BANK_NOTIFIED;
    report.metadata = {
      ...(report.metadata ?? {}),
      beneficiaryBankNotifiedAt: now.toISOString(),
      notifyChannel: 'internal-workflow'
    };
    await this.fraudReportRepo.save(report);
  }
}
