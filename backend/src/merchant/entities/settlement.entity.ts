import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';

export enum SettlementCycle {
  T0 = 'T0',
  T1 = 'T1'
}

export enum SettlementStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SETTLED = 'SETTLED',
  FAILED = 'FAILED'
}

@Entity({ name: 'settlements' })
@Index(['merchantId', 'settlementDate'])
@Index(['merchantId', 'status'])
export class Settlement extends BaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  merchantId!: string;

  @Column({
    type: 'enum',
    enum: SettlementCycle,
    enumName: 'settlement_cycle_enum',
    default: SettlementCycle.T1
  })
  cycle!: SettlementCycle;

  @Column({ type: 'date' })
  settlementDate!: string;

  @Column({ type: 'bigint' })
  totalAmount!: string;

  @Column({ type: 'bigint' })
  totalFee!: string;

  @Column({ type: 'bigint' })
  netAmount!: string;

  @Column({ type: 'integer' })
  transactionCount!: number;

  @Column({
    type: 'enum',
    enum: SettlementStatus,
    enumName: 'settlement_status_enum',
    default: SettlementStatus.PENDING
  })
  status!: SettlementStatus;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100 })
  reference!: string;

  @Column({ type: 'timestamp with time zone', nullable: true })
  settledAt!: Date | null;
}

