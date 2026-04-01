import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';
import { Currency } from '../../ledger/enums/currency.enum';

export enum TransferDestinationType {
  INTERNAL = 'INTERNAL',
  NIP = 'NIP'
}

export enum TransferStatus {
  PROCESSING = 'PROCESSING',
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  MANUAL_REVIEW = 'MANUAL_REVIEW'
}

@Entity({ name: 'transfers' })
export class Transfer extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100 })
  reference!: string;

  @Index({ unique: true })
  @Column({ type: 'uuid' })
  idempotencyKey!: string;

  @Index({ unique: true })
  @Column({ type: 'uuid', default: () => 'uuid_generate_v4()' })
  receiptId!: string;

  @Index()
  @Column({ type: 'varchar', length: 50, nullable: true })
  sessionId!: string | null;

  @Index()
  @Column({ type: 'uuid' })
  sourceWalletId!: string;

  @Index()
  @Column({ type: 'uuid' })
  sourceUserId!: string;

  @Column({
    type: 'enum',
    enum: TransferDestinationType,
    enumName: 'transfers_destination_type_enum'
  })
  destinationType!: TransferDestinationType;

  @Column({ type: 'varchar', length: 20 })
  destinationAccount!: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  destinationBank!: string | null;

  @Column({ type: 'varchar', length: 200 })
  destinationName!: string;

  @Column({ type: 'bigint' })
  amountMinor!: string;

  @Column({ type: 'bigint', default: '0' })
  feeMinor!: string;

  @Column({ type: 'enum', enum: Currency, enumName: 'transfers_currency_enum', default: Currency.NGN })
  currency!: Currency;

  @Column({ type: 'text', nullable: true })
  narration!: string | null;

  @Column({ type: 'enum', enum: TransferStatus, enumName: 'transfers_status_enum', default: TransferStatus.PENDING })
  status!: TransferStatus;

  @Column({ type: 'varchar', length: 5, nullable: true })
  nipResponseCode!: string | null;

  @Column({ type: 'text', nullable: true })
  nipResponseMessage!: string | null;

  @Column({ type: 'integer', default: 0 })
  tsqAttempts!: number;

  @Column({ type: 'timestamp with time zone', nullable: true })
  completedAt!: Date | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  reversedAt!: Date | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  provider!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  providerReference!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;
}
