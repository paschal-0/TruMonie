import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';
import { SettlementCycle } from './settlement.entity';

export enum MerchantBusinessType {
  SOLE_PROPRIETORSHIP = 'SOLE_PROPRIETORSHIP',
  LLC = 'LLC',
  PLC = 'PLC'
}

export enum MerchantStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  SUSPENDED = 'SUSPENDED'
}

@Entity({ name: 'merchants' })
export class Merchant extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'uuid' })
  ownerUserId!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  merchantCode!: string;

  @Column({ type: 'varchar', length: 200 })
  businessName!: string;

  @Column({
    type: 'enum',
    enum: MerchantBusinessType,
    enumName: 'merchant_business_type_enum'
  })
  businessType!: MerchantBusinessType;

  @Column({ type: 'varchar', length: 20, nullable: true })
  tin!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  rcNumber!: string | null;

  @Column({ type: 'varchar', length: 10 })
  categoryCode!: string;

  @Column({ type: 'uuid', nullable: true })
  walletId!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  settlementAccount!: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  settlementBank!: string | null;

  @Column({ type: 'jsonb' })
  address!: Record<string, unknown>;

  @Column({ type: 'jsonb' })
  geoLocation!: Record<string, unknown>;

  @Column({ type: 'integer', default: 10 })
  geoFenceRadius!: number;

  @Column({
    type: 'enum',
    enum: SettlementCycle,
    enumName: 'settlement_cycle_enum',
    default: SettlementCycle.T1
  })
  settlementCycle!: SettlementCycle;

  @Column({
    type: 'enum',
    enum: MerchantStatus,
    enumName: 'merchant_status_enum',
    default: MerchantStatus.PENDING
  })
  status!: MerchantStatus;

  @Column({ type: 'timestamp with time zone', nullable: true })
  approvedAt!: Date | null;

  @Column({ type: 'uuid', nullable: true })
  approvedBy!: string | null;
}
