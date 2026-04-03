import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';

export enum RegulatorySubmissionType {
  LICENSE_RENEWAL = 'LICENSE_RENEWAL',
  PERIODIC_RETURN = 'PERIODIC_RETURN',
  INCIDENT_REPORT = 'INCIDENT_REPORT',
  COMPLIANCE_ATTESTATION = 'COMPLIANCE_ATTESTATION'
}

export enum RegulatorySubmissionStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  FAILED = 'FAILED'
}

@Entity({ name: 'regulatory_submissions' })
@Index(['submissionType', 'createdAt'])
@Index(['status', 'createdAt'])
export class RegulatorySubmission extends BaseEntity {
  @Column({
    type: 'enum',
    enum: RegulatorySubmissionType,
    enumName: 'regulatory_submission_type_enum'
  })
  submissionType!: RegulatorySubmissionType;

  @Column({ type: 'varchar', length: 60, nullable: true })
  reportType!: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  period!: string | null;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ type: 'varchar', length: 120, nullable: true })
  slsgReference!: string | null;

  @Column({
    type: 'enum',
    enum: RegulatorySubmissionStatus,
    enumName: 'regulatory_submission_status_enum',
    default: RegulatorySubmissionStatus.PENDING
  })
  status!: RegulatorySubmissionStatus;

  @Column({ type: 'text', nullable: true })
  statusMessage!: string | null;

  @Column({ type: 'uuid', nullable: true })
  submittedBy!: string | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  submittedAt!: Date | null;
}

