import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';
import { User } from '../../users/entities/user.entity';
import { AccountStatus } from '../enums/account-status.enum';
import { AccountType } from '../enums/account-type.enum';
import { Currency } from '../enums/currency.enum';

@Entity({ name: 'accounts' })
export class Account extends BaseEntity {
  @Index()
  @Column({ type: 'uuid', nullable: true })
  userId!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user?: User | null;

  @Column({ type: 'enum', enum: Currency })
  currency!: Currency;

  @Column({ type: 'enum', enum: AccountType })
  type!: AccountType;

  @Column({ type: 'enum', enum: AccountStatus, default: AccountStatus.ACTIVE })
  status!: AccountStatus;

  @Column({ type: 'varchar', length: 128, nullable: true })
  label!: string | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 10, nullable: true })
  accountNumber!: string | null;

  @Column({ type: 'bigint', default: '0' })
  balanceMinor!: string;
}
