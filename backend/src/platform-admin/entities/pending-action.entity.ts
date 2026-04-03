import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';

export enum PendingActionStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED'
}

@Entity({ name: 'pending_actions' })
@Index(['status', 'createdAt'])
@Index(['actionType', 'status'])
export class PendingAction extends BaseEntity {
  @Column({ type: 'varchar', length: 50 })
  actionType!: string;

  @Column({ type: 'varchar', length: 50 })
  resourceType!: string;

  @Column({ type: 'uuid' })
  resourceId!: string;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ type: 'uuid' })
  makerId!: string;

  @Column({ type: 'text' })
  makerReason!: string;

  @Column({ type: 'uuid', nullable: true })
  checkerId!: string | null;

  @Column({ type: 'text', nullable: true })
  checkerReason!: string | null;

  @Column({
    type: 'enum',
    enum: PendingActionStatus,
    enumName: 'pending_action_status_enum',
    default: PendingActionStatus.PENDING
  })
  status!: PendingActionStatus;

  @Column({ type: 'timestamp with time zone' })
  expiresAt!: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  resolvedAt!: Date | null;
}

