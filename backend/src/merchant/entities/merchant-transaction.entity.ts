import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';
import { Currency } from '../../ledger/enums/currency.enum';

export enum MerchantTransactionChannel {
  CARD = 'CARD',
  TRANSFER = 'TRANSFER',
  QR = 'QR'
}

export enum MerchantTransactionType {
  CARD_PAYMENT = 'CARD_PAYMENT',
  TRANSFER_PAYMENT = 'TRANSFER_PAYMENT',
  QR_PAYMENT = 'QR_PAYMENT'
}

export enum MerchantTransactionStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  REVERSED = 'REVERSED'
}

@Entity({ name: 'merchant_transactions' })
@Index(['merchantId', 'postedAt'])
@Index(['merchantId', 'status'])
export class MerchantTransaction extends BaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  merchantId!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100 })
  reference!: string;

  @Column({ type: 'bigint' })
  amountMinor!: string;

  @Column({ type: 'bigint', default: '0' })
  feeMinor!: string;

  @Column({ type: 'bigint' })
  netAmountMinor!: string;

  @Column({ type: 'enum', enum: Currency, enumName: 'merchant_transaction_currency_enum', default: Currency.NGN })
  currency!: Currency;

  @Column({
    type: 'enum',
    enum: MerchantTransactionStatus,
    enumName: 'merchant_transaction_status_enum',
    default: MerchantTransactionStatus.SUCCESS
  })
  status!: MerchantTransactionStatus;

  @Column({
    type: 'enum',
    enum: MerchantTransactionChannel,
    enumName: 'merchant_transaction_channel_enum',
    default: MerchantTransactionChannel.TRANSFER
  })
  channel!: MerchantTransactionChannel;

  @Column({
    type: 'enum',
    enum: MerchantTransactionType,
    enumName: 'merchant_transaction_type_enum',
    default: MerchantTransactionType.TRANSFER_PAYMENT
  })
  type!: MerchantTransactionType;

  @Column({ type: 'varchar', length: 32, nullable: true })
  customerMaskedPan!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  settlementId!: string | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  settledAt!: Date | null;

  @Column({ type: 'timestamp with time zone', default: () => 'now()' })
  postedAt!: Date;
}
