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
  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'uuid' })
  sourceAccountId!: string;

  @Column({ type: 'enum', enum: Currency })
  currency!: Currency;

  @Column({ type: 'bigint' })
  amountMinor!: string;

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
