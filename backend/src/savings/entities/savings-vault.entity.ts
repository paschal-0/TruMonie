import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';
import { Currency } from '../../ledger/enums/currency.enum';
import { User } from '../../users/entities/user.entity';

export enum VaultStatus {
  ACTIVE = 'ACTIVE',
  LOCKED = 'LOCKED',
  COMPLETED = 'COMPLETED'
}

@Entity({ name: 'savings_vaults' })
export class SavingsVault extends BaseEntity {
  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'uuid' })
  accountId!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'enum', enum: Currency })
  currency!: Currency;

  @Column({ type: 'bigint', default: '0' })
  targetAmountMinor!: string;

  @Column({ type: 'bigint', default: '0' })
  balanceMinor!: string;

  @Column({ type: 'timestamp with time zone', nullable: true })
  lockedUntil!: Date | null;

  @Column({ type: 'enum', enum: VaultStatus, default: VaultStatus.ACTIVE })
  status!: VaultStatus;
}
