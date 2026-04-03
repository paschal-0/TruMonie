import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';

export enum AgentType {
  INDIVIDUAL = 'INDIVIDUAL',
  CORPORATE = 'CORPORATE'
}

export enum AgentStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  TERMINATED = 'TERMINATED'
}

export enum AgentTier {
  BASIC = 'BASIC',
  STANDARD = 'STANDARD',
  PREMIUM = 'PREMIUM'
}

@Entity({ name: 'agents' })
export class Agent extends BaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  ownerUserId!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 20 })
  agentCode!: string;

  @Column({ type: 'varchar', length: 200 })
  businessName!: string;

  @Column({ type: 'jsonb' })
  businessAddress!: Record<string, unknown>;

  @Column({ type: 'jsonb' })
  geoLocation!: Record<string, unknown>;

  @Column({ type: 'enum', enum: AgentType, enumName: 'agent_type_enum' })
  agentType!: AgentType;

  @Column({ type: 'uuid' })
  principalId!: string;

  @Column({ type: 'uuid' })
  superAgentId!: string;

  @Index({ unique: true })
  @Column({ type: 'uuid' })
  walletId!: string;

  @Column({ type: 'enum', enum: AgentStatus, enumName: 'agent_status_enum', default: AgentStatus.PENDING })
  status!: AgentStatus;

  @Column({ type: 'enum', enum: AgentTier, enumName: 'agent_tier_enum', default: AgentTier.BASIC })
  tier!: AgentTier;

  @Column({ type: 'timestamp with time zone', nullable: true })
  certifiedAt!: Date | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  suspendedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  suspendedReason!: string | null;
}

