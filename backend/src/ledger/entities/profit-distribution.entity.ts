import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';

@Entity({ name: 'profit_distributions' })
@Index(['poolId', 'period'])
export class ProfitDistribution extends BaseEntity {
  @Column({ type: 'uuid' })
  poolId!: string;

  @Column({ type: 'date' })
  period!: string;

  @Column({ type: 'bigint' })
  grossEarningsMinor!: string;

  @Column({ type: 'bigint' })
  expensesMinor!: string;

  @Column({ type: 'bigint' })
  perAllocationMinor!: string;

  @Column({ type: 'bigint' })
  distributableMinor!: string;

  @Column({ type: 'bigint' })
  investorShareMinor!: string;

  @Column({ type: 'bigint' })
  managerShareMinor!: string;

  @Column({ type: 'timestamp with time zone', nullable: true })
  distributedAt!: Date | null;
}

