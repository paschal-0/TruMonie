import { Column, Entity } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';

@Entity({ name: 'webhook_events' })
export class WebhookEvent extends BaseEntity {
  @Column({ type: 'varchar', length: 64 })
  provider!: string;

  @Column({ type: 'varchar', length: 128 })
  eventType!: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  idempotencyKey!: string | null;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;
}
