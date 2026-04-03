import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';

export enum FraudDecision {
  ALLOW = 'ALLOW',
  REVIEW = 'REVIEW',
  BLOCKED = 'BLOCKED'
}

@Entity({ name: 'fraud_alerts' })
@Index(['userId', 'generatedAt'])
@Index(['decision', 'generatedAt'])
@Index(['transactionId'])
export class FraudAlert extends BaseEntity {
  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'uuid', nullable: true })
  transactionId!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  transactionReference!: string | null;

  @Column({ type: 'integer' })
  riskScore!: number;

  @Column({ type: 'enum', enum: FraudDecision, enumName: 'fraud_decision_enum' })
  decision!: FraudDecision;

  @Column({ type: 'jsonb' })
  reasons!: Array<{ rule: string; detail: string; contribution: number }>;

  @Column({ type: 'varchar', length: 32 })
  modelVersion!: string;

  @Column({ type: 'jsonb', nullable: true })
  featureImportances!: Record<string, number> | null;

  @Column({ type: 'varchar', length: 64 })
  recommendedAction!: string;

  @Column({ type: 'timestamp with time zone' })
  generatedAt!: Date;
}
