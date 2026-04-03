import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';

export enum ComplianceRiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export enum ComplianceResolution {
  CLEARED = 'CLEARED',
  ESCALATED = 'ESCALATED',
  REPORTED = 'REPORTED'
}

@Entity({ name: 'compliance_events' })
@Index(['eventType', 'createdAt'])
@Index(['riskLevel', 'createdAt'])
@Index(['resolution', 'resolvedAt'])
export class ComplianceEvent extends BaseEntity {
  @Column({ type: 'varchar', length: 50 })
  eventType!: string;

  @Column({ type: 'uuid' })
  referenceId!: string;

  @Column({ type: 'uuid', nullable: true })
  userId!: string | null;

  @Column({ type: 'enum', enum: ComplianceRiskLevel, enumName: 'compliance_risk_level_enum' })
  riskLevel!: ComplianceRiskLevel;

  @Column({ type: 'jsonb' })
  details!: Record<string, unknown>;

  @Column({
    type: 'enum',
    enum: ComplianceResolution,
    enumName: 'compliance_resolution_enum',
    nullable: true
  })
  resolution!: ComplianceResolution | null;

  @Column({ type: 'uuid', nullable: true })
  resolvedBy!: string | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  resolvedAt!: Date | null;

  @Column({ type: 'boolean', default: false })
  nfiuReported!: boolean;

  @Column({ type: 'varchar', length: 100, nullable: true })
  nfiuReportRef!: string | null;
}
