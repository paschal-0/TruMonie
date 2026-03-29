import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';
import { Currency } from '../../ledger/enums/currency.enum';
import { SavingsVault } from './savings-vault.entity';
import { User } from '../../users/entities/user.entity';

export enum SavingsDirection {
  DEPOSIT = 'DEPOSIT',
  WITHDRAW = 'WITHDRAW'
}

@Entity({ name: 'savings_transactions' })
export class SavingsTransaction extends BaseEntity {
  @Column({ type: 'uuid' })
  vaultId!: string;

  @ManyToOne(() => SavingsVault, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vault_id' })
  vault!: SavingsVault;

  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'enum', enum: SavingsDirection })
  direction!: SavingsDirection;

  @Column({ type: 'bigint' })
  amountMinor!: string;

  @Column({ type: 'enum', enum: Currency })
  currency!: Currency;

  @Column({ type: 'varchar', length: 128 })
  reference!: string;
}
