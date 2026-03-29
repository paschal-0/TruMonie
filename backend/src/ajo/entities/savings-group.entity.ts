import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';
import { Currency } from '../../ledger/enums/currency.enum';
import { User } from '../../users/entities/user.entity';
import { GroupStatus } from '../enums/group-status.enum';

@Entity({ name: 'savings_groups' })
export class SavingsGroup extends BaseEntity {
  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'uuid' })
  createdById!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by_id' })
  createdBy!: User;

  @Column({ type: 'enum', enum: Currency })
  currency!: Currency;

  @Column({ type: 'bigint' })
  contributionAmountMinor!: string;

  @Column({ type: 'int' })
  memberTarget!: number;

  @Column({ type: 'enum', enum: GroupStatus, default: GroupStatus.ACTIVE })
  status!: GroupStatus;

  @Column({ type: 'uuid', nullable: true })
  escrowAccountId!: string | null;

  @Column({ type: 'int', default: 7 })
  payoutIntervalDays!: number;

  @Column({ type: 'int', default: 1 })
  nextPayoutPosition!: number;

  @Column({ type: 'timestamp with time zone', nullable: true })
  nextPayoutDate!: Date | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  lastCycleRef!: string | null;
}
