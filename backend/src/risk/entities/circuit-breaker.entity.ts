import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';
import { User } from '../../users/entities/user.entity';

export enum CircuitBreakerType {
  NEW_DEVICE = 'NEW_DEVICE'
}

@Entity({ name: 'circuit_breakers' })
@Index(['userId', 'type'])
export class CircuitBreaker extends BaseEntity {
  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'enum', enum: CircuitBreakerType })
  type!: CircuitBreakerType;

  @Column({ type: 'bigint' })
  maxAmountMinor!: string;

  @Column({ type: 'timestamp with time zone' })
  activatedAt!: Date;

  @Column({ type: 'timestamp with time zone' })
  expiresAt!: Date;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;
}
