import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';
import { SavingsGroup } from './savings-group.entity';

@Entity({ name: 'group_activities' })
export class GroupActivity extends BaseEntity {
  @Column({ type: 'uuid' })
  groupId!: string;

  @ManyToOne(() => SavingsGroup, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'group_id' })
  group!: SavingsGroup;

  @Column({ type: 'varchar', length: 64 })
  type!: string;

  @Column({ type: 'varchar', length: 255 })
  message!: string;
}
