import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThanOrEqual, Repository } from 'typeorm';

import { CircuitBreakerService } from '../risk/circuit-breaker.service';
import { Transfer, TransferDestinationType, TransferStatus } from '../payments/entities/transfer.entity';
import { TransferBeneficiary } from '../payments/entities/transfer-beneficiary.entity';
import { FraudDecision } from './entities/fraud-alert.entity';

export interface FraudEngineInput {
  userId: string;
  amountMinor: string;
  sourceBalanceMinor?: string | null;
  destinationType: TransferDestinationType;
  destinationAccount?: string | null;
  destinationBank?: string | null;
  transactionReference?: string | null;
}

export interface FraudEngineRuleReason {
  rule: string;
  detail: string;
  contribution: number;
}

export interface FraudEngineOutput {
  riskScore: number;
  decision: FraudDecision;
  reasons: FraudEngineRuleReason[];
  featureImportances: Record<string, number>;
  modelVersion: string;
  recommendedAction: string;
}

@Injectable()
export class FraudEngineService {
  private readonly modelVersion: string;
  private readonly mlEnabled: boolean;
  private readonly mlWeight: number;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Transfer)
    private readonly transferRepo: Repository<Transfer>,
    @InjectRepository(TransferBeneficiary)
    private readonly beneficiaryRepo: Repository<TransferBeneficiary>,
    private readonly circuitBreakerService: CircuitBreakerService
  ) {
    this.modelVersion = this.configService.get<string>('fraud.modelVersion', 'fraud-v1.0.0');
    this.mlEnabled = this.configService.get<boolean>('fraud.mlEnabled', true);
    this.mlWeight = Math.min(Math.max(this.configService.get<number>('fraud.mlWeight', 0.35), 0), 1);
  }

  async evaluate(input: FraudEngineInput): Promise<FraudEngineOutput> {
    const rules: FraudEngineRuleReason[] = [];
    const amountMinor = BigInt(input.amountMinor);
    const now = new Date();

    const velocityCount10m = await this.transferRepo.count({
      where: {
        sourceUserId: input.userId,
        createdAt: MoreThanOrEqual(new Date(now.getTime() - 10 * 60 * 1000))
      }
    });
    if (velocityCount10m > 5) {
      rules.push({
        rule: 'VELOCITY',
        detail: `${velocityCount10m} transfers in last 10 minutes (threshold: 5)`,
        contribution: 30
      });
    }

    const avgRaw = await this.transferRepo
      .createQueryBuilder('t')
      .select('AVG(t.amountMinor::numeric)', 'avg')
      .where('t.sourceUserId = :userId', { userId: input.userId })
      .andWhere('t.createdAt >= :since', {
        since: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      })
      .andWhere('t.status = :status', { status: TransferStatus.SUCCESS })
      .getRawOne<{ avg: string | null }>();
    const avgMinor = avgRaw?.avg ? BigInt(Math.floor(Number(avgRaw.avg))) : 0n;
    if (avgMinor > 0n && amountMinor > avgMinor * 3n) {
      rules.push({
        rule: 'HIGH_VALUE',
        detail: `Amount is >3x 30-day average (amount: ${amountMinor}, avg: ${avgMinor})`,
        contribution: 20
      });
    }

    if (
      input.destinationType === TransferDestinationType.NIP &&
      input.destinationBank &&
      input.destinationAccount &&
      amountMinor > 10_000_000n
    ) {
      const knownBene = await this.beneficiaryRepo.findOne({
        where: {
          userId: input.userId,
          bankCode: input.destinationBank,
          accountNumber: input.destinationAccount,
          deletedAt: IsNull()
        }
      });
      if (!knownBene) {
        rules.push({
          rule: 'NEW_BENEFICIARY_HIGH_AMOUNT',
          detail: 'First-time beneficiary and amount exceeds NGN 100,000',
          contribution: 15
        });
      }
    }

    const hour = now.getHours();
    if (hour >= 1 && hour < 5) {
      rules.push({
        rule: 'TIME_ANOMALY',
        detail: 'Transaction occurred between 01:00 and 05:00',
        contribution: 10
      });
    }

    if (input.sourceBalanceMinor) {
      const balance = BigInt(input.sourceBalanceMinor);
      if (balance > 0n && amountMinor * 100n >= balance * 70n) {
        rules.push({
          rule: 'RAPID_DRAIN',
          detail: 'Transfer amount is >= 70% of wallet balance',
          contribution: 35
        });
      }
    }

    const newDeviceCap = await this.circuitBreakerService.getActiveNewDeviceCap(input.userId);
    if (newDeviceCap) {
      rules.push({
        rule: 'DEVICE_MISMATCH',
        detail: 'Recent device change detected; additional risk applied',
        contribution: 40
      });
    }

    if (input.destinationType === TransferDestinationType.NIP && input.destinationAccount) {
      const counterpartiesRaw = await this.transferRepo
        .createQueryBuilder('t')
        .select('COUNT(DISTINCT t.sourceUserId)', 'count')
        .where('t.destinationAccount = :destinationAccount', {
          destinationAccount: input.destinationAccount
        })
        .andWhere('t.destinationBank = :destinationBank', {
          destinationBank: input.destinationBank ?? null
        })
        .andWhere('t.createdAt >= :since', {
          since: new Date(now.getTime() - 24 * 60 * 60 * 1000)
        })
        .getRawOne<{ count: string }>();
      const distinctSources = Number.parseInt(counterpartiesRaw?.count ?? '0', 10);
      if (distinctSources >= 3) {
        rules.push({
          rule: 'MULE_NETWORK_PATTERN',
          detail: `${distinctSources} distinct senders paid this beneficiary in 24h`,
          contribution: 22
        });
      }
    }

    const uniqueDestinationCountRaw = await this.transferRepo
      .createQueryBuilder('t')
      .select("COUNT(DISTINCT COALESCE(t.destinationBank, '') || ':' || COALESCE(t.destinationAccount, ''))", 'count')
      .where('t.sourceUserId = :userId', { userId: input.userId })
      .andWhere('t.createdAt >= :since', {
        since: new Date(now.getTime() - 60 * 60 * 1000)
      })
      .andWhere('t.destinationType = :destinationType', { destinationType: TransferDestinationType.NIP })
      .getRawOne<{ count: string }>();
    const uniqueDestinations1h = Number.parseInt(uniqueDestinationCountRaw?.count ?? '0', 10);
    if (uniqueDestinations1h >= 4) {
      rules.push({
        rule: 'FUNNEL_PATTERN',
        detail: `${uniqueDestinations1h} unique beneficiaries in the last hour`,
        contribution: 18
      });
    }

    const ruleScore = Math.min(rules.reduce((sum, item) => sum + item.contribution, 0), 100);
    const mlScore = this.mlEnabled
      ? this.computePseudoMlScore({
          amountMinor,
          avgMinor,
          velocityCount10m,
          uniqueDestinations1h,
          hasNewDevice: Boolean(newDeviceCap)
        })
      : ruleScore;
    const riskScore = this.mlEnabled
      ? Math.min(Math.round(ruleScore * (1 - this.mlWeight) + mlScore * this.mlWeight), 100)
      : ruleScore;

    const decision = this.decisionFromScore(riskScore);
    const totalContribution = rules.reduce((sum, item) => sum + item.contribution, 0) || 1;
    const featureImportances = rules.reduce<Record<string, number>>((acc, item) => {
      acc[item.rule.toLowerCase()] = Number((item.contribution / totalContribution).toFixed(2));
      return acc;
    }, {});
    if (this.mlEnabled) {
      featureImportances.ml_model = Number(this.mlWeight.toFixed(2));
    }

    return {
      riskScore,
      decision,
      reasons: rules,
      featureImportances,
      modelVersion: this.modelVersion,
      recommendedAction: this.recommendedAction(decision)
    };
  }

  private computePseudoMlScore(input: {
    amountMinor: bigint;
    avgMinor: bigint;
    velocityCount10m: number;
    uniqueDestinations1h: number;
    hasNewDevice: boolean;
  }) {
    const amountRatio = input.avgMinor > 0n ? Number(input.amountMinor) / Number(input.avgMinor) : 1;
    const normalizedAmount = Math.min(amountRatio / 5, 1);
    const normalizedVelocity = Math.min(input.velocityCount10m / 10, 1);
    const normalizedFanout = Math.min(input.uniqueDestinations1h / 8, 1);
    const devicePenalty = input.hasNewDevice ? 1 : 0;

    const score01 =
      normalizedAmount * 0.35 +
      normalizedVelocity * 0.30 +
      normalizedFanout * 0.20 +
      devicePenalty * 0.15;
    return Math.round(score01 * 100);
  }

  private decisionFromScore(score: number): FraudDecision {
    if (score <= 40) return FraudDecision.ALLOW;
    if (score <= 70) return FraudDecision.REVIEW;
    return FraudDecision.BLOCKED;
  }

  private recommendedAction(decision: FraudDecision) {
    if (decision === FraudDecision.ALLOW) return 'PROCEED';
    if (decision === FraudDecision.REVIEW) return 'HOLD_AND_CONTACT_CUSTOMER';
    return 'BLOCK_AND_ESCALATE';
  }
}
