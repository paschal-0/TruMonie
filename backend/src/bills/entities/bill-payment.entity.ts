import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';
import { Currency } from '../../ledger/enums/currency.enum';
import { User } from '../../users/entities/user.entity';

export enum BillStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED'
}

@Entity({ name: 'bill_payments' })
export class BillPayment extends BaseEntity {
  @Column({ type: 'varchar', length: 100, nullable: true, unique: true })
  reference!: string | null;

  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'uuid', nullable: true })
  walletId!: string | null;

  @Column({ type: 'uuid' })
  sourceAccountId!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  billerId!: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  category!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  validationRef!: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  customerName!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  customerRef!: string | null;

  @Column({ type: 'enum', enum: Currency })
  currency!: Currency;

  @Column({ type: 'bigint' })
  amountMinor!: string;

  @Column({ type: 'bigint', default: '0' })
  feeMinor!: string;

  @Column({ type: 'text', nullable: true })
  token!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  units!: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  aggregator!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  aggregatorRef!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  idempotencyKey!: string | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  completedAt!: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  sessionId!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  receipt!: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 64 })
  provider!: string;

  @Column({ type: 'varchar', length: 128 })
  providerReference!: string;

  @Column({ type: 'enum', enum: BillStatus, default: BillStatus.PENDING })
  status!: BillStatus;

  @Column({ type: 'jsonb' })
  request!: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  response!: Record<string, unknown> | null;
}
