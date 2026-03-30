import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';

@Entity({ name: 'notifications' })
export class Notification extends BaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 64 })
  type!: string;

  @Column({ type: 'text' })
  message!: string;

  @Column({ type: 'jsonb', nullable: true })
  payload!: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 50 })
  provider!: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  providerReference!: string | null;

  @Column({ type: 'boolean', default: false })
  delivered!: boolean;

  @Index()
  @Column({ type: 'timestamp with time zone', nullable: true })
  readAt!: Date | null;
}
