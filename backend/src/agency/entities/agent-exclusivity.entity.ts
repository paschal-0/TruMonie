import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';

export enum AgentExclusivityStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE'
}

@Entity({ name: 'agent_exclusivity' })
export class AgentExclusivity extends BaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  agentId!: string;

  @Column({ type: 'uuid' })
  principalId!: string;

  @Column({ type: 'uuid' })
  superAgentId!: string;

  @Column({ type: 'date', default: '2026-04-01' })
  effectiveDate!: string;

  @Column({
    type: 'enum',
    enum: AgentExclusivityStatus,
    enumName: 'agent_exclusivity_status_enum',
    default: AgentExclusivityStatus.ACTIVE
  })
  status!: AgentExclusivityStatus;

  @Column({ type: 'timestamp with time zone', nullable: true })
  verifiedAt!: Date | null;

  @Column({ type: 'uuid', nullable: true })
  verifiedBy!: string | null;
}

