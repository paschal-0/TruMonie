import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';
import { User } from '../../users/entities/user.entity';

export enum BillValidationStatus {
  PENDING = 'PENDING',
  USED = 'USED',
  EXPIRED = 'EXPIRED'
}

@Entity({ name: 'bill_validations' })
export class BillValidation extends BaseEntity {
  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'uuid', nullable: true })
  walletId!: string | null;

  @Column({ type: 'varchar', length: 64 })
  billerId!: string;

  @Column({ type: 'varchar', length: 30 })
  category!: string;

  @Column({ type: 'varchar', length: 30 })
  provider!: string;

  @Column({ type: 'jsonb' })
  requestFields!: Record<string, string>;

  @Column({ type: 'varchar', length: 200, nullable: true })
  customerName!: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  customerAddress!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  customerRef!: string | null;

  @Column({ type: 'bigint', default: '0' })
  outstandingBalanceMinor!: string;

  @Column({ type: 'bigint', default: '0' })
  minimumAmountMinor!: string;

  @Column({ type: 'enum', enum: BillValidationStatus, default: BillValidationStatus.PENDING })
  status!: BillValidationStatus;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @Column({ type: 'timestamp with time zone' })
  expiresAt!: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  usedAt!: Date | null;
}

