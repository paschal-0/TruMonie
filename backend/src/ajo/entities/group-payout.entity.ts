import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';
import { Currency } from '../../ledger/enums/currency.enum';
import { SavingsGroup } from './savings-group.entity';
import { GroupMember } from './group-member.entity';
import { User } from '../../users/entities/user.entity';

@Entity({ name: 'group_payouts' })
export class GroupPayout extends BaseEntity {
  @Column({ type: 'uuid' })
  groupId!: string;

  @ManyToOne(() => SavingsGroup, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'group_id' })
  group!: SavingsGroup;

  @Column({ type: 'uuid' })
  memberId!: string;

  @ManyToOne(() => GroupMember, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'member_id' })
  member!: GroupMember;

  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'bigint' })
  amountMinor!: string;

  @Column({ type: 'enum', enum: Currency })
  currency!: Currency;

  @Column({ type: 'varchar', length: 64 })
  cycleRef!: string;

  @Column({ type: 'varchar', length: 16 })
  status!: 'PENDING' | 'PAID' | 'FAILED';
}
