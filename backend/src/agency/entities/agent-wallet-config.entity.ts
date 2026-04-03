import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';

@Entity({ name: 'agent_wallet_config' })
export class AgentWalletConfig extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'uuid' })
  walletId!: string;

  @Index({ unique: true })
  @Column({ type: 'uuid' })
  agentId!: string;

  @Column({ type: 'bigint' })
  floatLimit!: string;

  @Column({ type: 'bigint' })
  lowBalanceThreshold!: string;

  @Column({ type: 'boolean', default: false })
  autoFundEnabled!: boolean;

  @Column({ type: 'uuid', nullable: true })
  autoFundSource!: string | null;

  @Column({ type: 'bigint', nullable: true })
  autoFundAmount!: string | null;
}

