import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';

@Entity({ name: 'system_config' })
@Index(['configKey', 'version'], { unique: true })
@Index(['configKey', 'isActive'])
export class SystemConfig extends BaseEntity {
  @Column({ type: 'varchar', length: 100 })
  configKey!: string;

  @Column({ type: 'jsonb' })
  configValue!: Record<string, unknown>;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'uuid' })
  changedBy!: string;

  @Column({ type: 'uuid', nullable: true })
  approvedBy!: string | null;

  @Column({ type: 'integer', default: 1 })
  version!: number;

  @Column({ type: 'boolean', default: false })
  isActive!: boolean;
}

