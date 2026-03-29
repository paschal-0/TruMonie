import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';
import { User } from '../../users/entities/user.entity';

export enum DeviceStatus {
  ACTIVE = 'ACTIVE',
  BLOCKED = 'BLOCKED'
}

@Entity({ name: 'user_devices' })
@Index(['userId', 'fingerprint'], { unique: true })
export class UserDevice extends BaseEntity {
  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'varchar', length: 128 })
  fingerprint!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  deviceType!: string | null;

  @Column({ type: 'enum', enum: DeviceStatus, default: DeviceStatus.ACTIVE })
  status!: DeviceStatus;

  @Column({ type: 'timestamp with time zone', nullable: true })
  lastSeenAt!: Date | null;
}
