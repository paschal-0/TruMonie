import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';
import { User } from '../../users/entities/user.entity';
import { Currency } from '../../ledger/enums/currency.enum';

export enum FundingStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED'
}

@Entity({ name: 'funding_transactions' })
export class FundingTransaction extends BaseEntity {
  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'uuid' })
  destinationAccountId!: string;

  @Column({ type: 'enum', enum: Currency })
  currency!: Currency;

  @Column({ type: 'bigint' })
  amountMinor!: string;

  @Column({ type: 'enum', enum: FundingStatus, default: FundingStatus.PENDING })
  status!: FundingStatus;

  @Column({ type: 'varchar', length: 64 })
  provider!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 128 })
  reference!: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;
}
