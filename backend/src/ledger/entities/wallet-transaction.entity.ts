import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';

export enum WalletTransactionType {
  CREDIT = 'CREDIT',
  DEBIT = 'DEBIT'
}

export enum WalletTransactionStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  REVERSED = 'REVERSED'
}

@Entity({ name: 'wallet_transactions' })
@Index(['walletId', 'postedAt'])
@Index(['walletId', 'type', 'status', 'category'])
export class WalletTransaction extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100 })
  reference!: string;

  @Column({ type: 'uuid' })
  walletId!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'enum', enum: WalletTransactionType })
  type!: WalletTransactionType;

  @Column({ type: 'varchar', length: 30 })
  category!: string;

  @Column({ type: 'bigint' })
  amountMinor!: string;

  @Column({ type: 'bigint', default: '0' })
  feeMinor!: string;

  @Column({ type: 'enum', enum: WalletTransactionStatus })
  status!: WalletTransactionStatus;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'jsonb', nullable: true })
  counterparty!: Record<string, unknown> | null;

  @Column({ type: 'bigint' })
  balanceBeforeMinor!: string;

  @Column({ type: 'bigint' })
  balanceAfterMinor!: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  channel!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  sessionId!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @Column({ type: 'timestamp with time zone', default: () => 'now()' })
  postedAt!: Date;
}
