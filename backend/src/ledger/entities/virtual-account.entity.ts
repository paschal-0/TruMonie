import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';

@Entity({ name: 'virtual_accounts' })
@Index(['walletId', 'currency', 'provider', 'status'])
export class VirtualAccount extends BaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  walletId!: string;

  @Index()
  @Column({ type: 'uuid' })
  userId!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 20 })
  accountNumber!: string;

  @Column({ type: 'varchar', length: 200 })
  accountName!: string;

  @Column({ type: 'varchar', length: 100 })
  bankName!: string;

  @Column({ type: 'varchar', length: 10 })
  bankCode!: string;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  @Column({ type: 'varchar', length: 30 })
  provider!: string;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status!: string;
}
