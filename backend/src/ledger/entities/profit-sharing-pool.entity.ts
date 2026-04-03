import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';

export enum ProfitPoolType {
  MUDARABAH = 'MUDARABAH',
  MUSHARAKAH = 'MUSHARAKAH'
}

export enum ProfitPoolStatus {
  ACTIVE = 'ACTIVE',
  CLOSED = 'CLOSED'
}

@Entity({ name: 'profit_sharing_pools' })
@Index(['poolType', 'status'])
export class ProfitSharingPool extends BaseEntity {
  @Column({ type: 'varchar', length: 100 })
  poolName!: string;

  @Column({ type: 'enum', enum: ProfitPoolType, enumName: 'profit_pool_type_enum' })
  poolType!: ProfitPoolType;

  @Column({ type: 'bigint' })
  totalCapitalMinor!: string;

  @Column({ type: 'date' })
  periodStart!: string;

  @Column({ type: 'date' })
  periodEnd!: string;

  @Column({ type: 'numeric', precision: 8, scale: 6 })
  psrInvestor!: string;

  @Column({ type: 'numeric', precision: 8, scale: 6 })
  psrManager!: string;

  @Column({ type: 'numeric', precision: 8, scale: 6, default: '0.020000' })
  perRate!: string;

  @Column({ type: 'enum', enum: ProfitPoolStatus, enumName: 'profit_pool_status_enum', default: ProfitPoolStatus.ACTIVE })
  status!: ProfitPoolStatus;
}

