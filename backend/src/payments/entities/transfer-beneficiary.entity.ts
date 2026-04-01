import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';

@Entity({ name: 'transfer_beneficiaries' })
@Index(['userId', 'bankCode', 'accountNumber'])
export class TransferBeneficiary extends BaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 20 })
  accountNumber!: string;

  @Column({ type: 'varchar', length: 10 })
  bankCode!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  bankName!: string | null;

  @Column({ type: 'varchar', length: 200 })
  accountName!: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  alias!: string | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  lastUsedAt!: Date | null;

  @Index()
  @Column({ type: 'timestamp with time zone', nullable: true })
  deletedAt!: Date | null;
}
