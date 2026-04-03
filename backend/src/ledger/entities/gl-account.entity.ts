import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';

export enum GlAccountType {
  ASSET = 'ASSET',
  LIABILITY = 'LIABILITY',
  EQUITY = 'EQUITY',
  INCOME = 'INCOME',
  EXPENSE = 'EXPENSE'
}

export enum GlNormalBalance {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT'
}

@Entity({ name: 'gl_accounts' })
export class GlAccount extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 10 })
  accountCode!: string;

  @Column({ type: 'varchar', length: 200 })
  accountName!: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  parentCode!: string | null;

  @Column({ type: 'enum', enum: GlAccountType, enumName: 'gl_account_type_enum' })
  accountType!: GlAccountType;

  @Column({ type: 'enum', enum: GlNormalBalance, enumName: 'gl_normal_balance_enum' })
  normalBalance!: GlNormalBalance;

  @Column({ type: 'varchar', length: 3, default: 'NGN' })
  currency!: string;

  @Column({ type: 'bigint', default: '0' })
  balanceMinor!: string;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;
}

