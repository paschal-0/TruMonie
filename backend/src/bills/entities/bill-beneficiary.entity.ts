import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';
import { User } from '../../users/entities/user.entity';

@Entity({ name: 'bill_beneficiaries' })
export class BillBeneficiary extends BaseEntity {
  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'varchar', length: 255 })
  nickname!: string;

  @Column({ type: 'varchar', length: 64 })
  productCode!: string;

  @Column({ type: 'varchar', length: 128 })
  destination!: string;
}
