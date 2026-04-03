import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';

export enum FraudReportType {
  APP_FRAUD = 'APP_FRAUD'
}

export enum FraudReportStatus {
  RECEIVED = 'RECEIVED',
  BENEFICIARY_BANK_NOTIFIED = 'BENEFICIARY_BANK_NOTIFIED',
  INVESTIGATION_OVERDUE = 'INVESTIGATION_OVERDUE',
  RESOLVED = 'RESOLVED',
  ESCALATED_NFIU = 'ESCALATED_NFIU'
}

@Entity({ name: 'fraud_reports' })
@Index(['transactionId', 'reportType', 'userId'], { unique: true })
@Index(['status', 'notificationSentAt'])
@Index(['status', 'resolutionDeadlineAt'])
@Index(['status', 'nfiuReportDueAt'])
export class FraudReport extends BaseEntity {
  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'uuid' })
  transactionId!: string;

  @Column({ type: 'enum', enum: FraudReportType, enumName: 'fraud_report_type_enum' })
  reportType!: FraudReportType;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'bigint' })
  reportedAmountMinor!: string;

  @Column({
    type: 'enum',
    enum: FraudReportStatus,
    enumName: 'fraud_report_status_enum',
    default: FraudReportStatus.RECEIVED
  })
  status!: FraudReportStatus;

  @Column({ type: 'boolean', default: false })
  beneficiaryBankNotified!: boolean;

  @Column({ type: 'timestamp with time zone', nullable: true })
  notificationSentAt!: Date | null;

  @Column({ type: 'timestamp with time zone' })
  resolutionDeadlineAt!: Date;

  @Column({ type: 'timestamp with time zone' })
  nfiuReportDueAt!: Date;

  @Column({ type: 'boolean', default: false })
  nfiuReported!: boolean;

  @Column({ type: 'timestamp with time zone', nullable: true })
  nfiuReportedAt!: Date | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  resolvedAt!: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;
}
