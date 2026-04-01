import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';

@Entity({ name: 'wallet_events' })
@Index(['eventType', 'publishedAt'])
export class WalletEvent extends BaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  userId!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  walletId!: string | null;

  @Column({ type: 'varchar', length: 64 })
  eventType!: string;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ type: 'timestamp with time zone', default: () => 'now()' })
  publishedAt!: Date;
}
