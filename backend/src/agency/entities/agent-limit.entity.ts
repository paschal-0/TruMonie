import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';

export enum AgentLimitType {
  CASH_IN = 'CASH_IN',
  CASH_OUT = 'CASH_OUT',
  TOTAL = 'TOTAL',
  CUMULATIVE_CASH_OUT = 'CUMULATIVE_CASH_OUT',
  SINGLE_TXN = 'SINGLE_TXN'
}

export enum AgentLimitPeriod {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  TRANSACTION = 'TRANSACTION'
}

export enum AgentLimitAppliesTo {
  CUSTOMER = 'CUSTOMER',
  AGENT = 'AGENT'
}

@Entity({ name: 'agent_limits' })
export class AgentLimit extends BaseEntity {
  @Index()
  @Column({ type: 'enum', enum: AgentLimitType, enumName: 'agent_limit_type_enum' })
  limitType!: AgentLimitType;

  @Column({ type: 'enum', enum: AgentLimitPeriod, enumName: 'agent_limit_period_enum' })
  period!: AgentLimitPeriod;

  @Column({ type: 'bigint' })
  maxAmount!: string;

  @Column({ type: 'enum', enum: AgentLimitAppliesTo, enumName: 'agent_limit_applies_to_enum' })
  appliesTo!: AgentLimitAppliesTo;

  @Column({ type: 'date' })
  effectiveFrom!: string;

  @Column({ type: 'date', nullable: true })
  effectiveTo!: string | null;
}

