import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';
import { AgentTransactionType } from './agent-transaction.entity';

export enum AgentCommissionStatus {
  PENDING = 'PENDING',
  SETTLED = 'SETTLED'
}

@Entity({ name: 'agent_commissions' })
export class AgentCommission extends BaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  agentId!: string;

  @Index()
  @Column({ type: 'uuid' })
  transactionId!: string;

  @Column({ type: 'enum', enum: AgentTransactionType, enumName: 'agent_commission_transaction_type_enum' })
  transactionType!: AgentTransactionType;

  @Column({ type: 'bigint' })
  transactionAmount!: string;

  @Column({ type: 'bigint' })
  commissionAmount!: string;

  @Column({ type: 'numeric', precision: 5, scale: 4 })
  rate!: string;

  @Column({
    type: 'enum',
    enum: AgentCommissionStatus,
    enumName: 'agent_commission_status_enum',
    default: AgentCommissionStatus.PENDING
  })
  status!: AgentCommissionStatus;

  @Column({ type: 'timestamp with time zone', nullable: true })
  settledAt!: Date | null;
}

