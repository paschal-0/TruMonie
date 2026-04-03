import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';
import { Currency } from '../../ledger/enums/currency.enum';

export enum AgentTransactionType {
  CASH_IN = 'CASH_IN',
  CASH_OUT = 'CASH_OUT',
  BILL_PAYMENT = 'BILL_PAYMENT',
  ACCOUNT_OPENING = 'ACCOUNT_OPENING'
}

export enum AgentTransactionStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  REVERSED = 'REVERSED'
}

@Entity({ name: 'agent_transactions' })
export class AgentTransaction extends BaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  agentId!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100 })
  reference!: string;

  @Index({ unique: true })
  @Column({ type: 'uuid' })
  idempotencyKey!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  customerUserId!: string | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  customerWalletId!: string | null;

  @Column({ type: 'enum', enum: AgentTransactionType, enumName: 'agent_transaction_type_enum' })
  type!: AgentTransactionType;

  @Column({ type: 'enum', enum: AgentTransactionStatus, enumName: 'agent_transaction_status_enum' })
  status!: AgentTransactionStatus;

  @Column({ type: 'bigint' })
  amountMinor!: string;

  @Column({ type: 'bigint', default: '0' })
  commissionMinor!: string;

  @Column({ type: 'enum', enum: Currency, enumName: 'agent_transaction_currency_enum', default: Currency.NGN })
  currency!: Currency;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @Index()
  @Column({ type: 'timestamp with time zone', default: () => 'now()' })
  postedAt!: Date;
}

