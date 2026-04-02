import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';

export enum PosTerminalStatus {
  ACTIVE = 'ACTIVE',
  PENDING = 'PENDING',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED'
}

@Entity({ name: 'pos_terminals' })
@Index(['merchantId', 'status'])
export class PosTerminal extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 8 })
  terminalId!: string;

  @Index()
  @Column({ type: 'uuid' })
  merchantId!: string;

  @Column({ type: 'varchar', length: 50 })
  serialNumber!: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  model!: string | null;

  @Column({ type: 'varchar', length: 20 })
  ptsaId!: string;

  @Column({ type: 'jsonb' })
  geoLocation!: Record<string, unknown>;

  @Column({ type: 'integer', default: 10 })
  geoFenceRadius!: number;

  @Column({ type: 'boolean', default: true })
  isOnline!: boolean;

  @Column({ type: 'timestamp with time zone', nullable: true })
  lastHeartbeat!: Date | null;

  @Column({
    type: 'enum',
    enum: PosTerminalStatus,
    enumName: 'pos_terminal_status_enum',
    default: PosTerminalStatus.ACTIVE
  })
  status!: PosTerminalStatus;
}

