import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';
import { User } from '../../users/entities/user.entity';
import { SavingsGroup } from './savings-group.entity';
import { MemberStatus } from '../enums/member-status.enum';

@Entity({ name: 'group_members' })
export class GroupMember extends BaseEntity {
  @Column({ type: 'uuid' })
  groupId!: string;

  @ManyToOne(() => SavingsGroup, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'group_id' })
  group!: SavingsGroup;

  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'int' })
  position!: number;

  @Column({ type: 'enum', enum: MemberStatus, default: MemberStatus.ACTIVE })
  status!: MemberStatus;

  @Column({ type: 'int', default: 0 })
  cyclesContributed!: number;

  @Column({ type: 'int', default: 0 })
  cyclesReceived!: number;
}
