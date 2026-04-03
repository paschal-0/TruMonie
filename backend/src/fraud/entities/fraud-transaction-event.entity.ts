import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';
import { Currency } from '../../ledger/enums/currency.enum';
import { TransferDestinationType } from '../../payments/entities/transfer.entity';
import { FraudDecision } from './fraud-alert.entity';

export enum FraudEventStatus {
  PENDING = 'PENDING',
  PROCESSED = 'PROCESSED',
  FAILED = 'FAILED'
}

@Entity({ name: 'fraud_transaction_events' })
@Index(['status', 'createdAt'])
@Index(['userId', 'createdAt'])
@Index(['transactionReference'])
export class FraudTransactionEvent extends BaseEntity {
  @Column({ type: 'varchar', length: 50, default: 'TRANSFER_INITIATED' })
  eventType!: string;

  @Column({ type: 'varchar', length: 30, default: 'TRANSFER' })
  sourceType!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'uuid', nullable: true })
  transactionId!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  transactionReference!: string | null;

  @Column({ type: 'bigint' })
  amountMinor!: string;

  @Column({ type: 'enum', enum: Currency, enumName: 'fraud_events_currency_enum', default: Currency.NGN })
  currency!: Currency;

  @Column({
    type: 'enum',
    enum: TransferDestinationType,
    enumName: 'fraud_events_destination_type_enum'
  })
  destinationType!: TransferDestinationType;

  @Column({ type: 'varchar', length: 20, nullable: true })
  destinationAccount!: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  destinationBank!: string | null;

  @Column({ type: 'bigint', nullable: true })
  sourceBalanceMinor!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @Column({ type: 'enum', enum: FraudEventStatus, enumName: 'fraud_event_status_enum', default: FraudEventStatus.PENDING })
  status!: FraudEventStatus;

  @Column({ type: 'timestamp with time zone', nullable: true })
  processedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ type: 'uuid', nullable: true })
  fraudAlertId!: string | null;

  @Column({ type: 'enum', enum: FraudDecision, enumName: 'fraud_decision_enum', nullable: true })
  decision!: FraudDecision | null;

  @Column({ type: 'integer', nullable: true })
  riskScore!: number | null;
}
