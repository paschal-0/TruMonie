import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';
import { User } from '../../users/entities/user.entity';

export enum CardStatus {
  ACTIVE = 'ACTIVE',
  BLOCKED = 'BLOCKED',
  CLOSED = 'CLOSED'
}

export enum CardType {
  VIRTUAL = 'VIRTUAL'
}

@Entity({ name: 'cards' })
export class Card extends BaseEntity {
  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'uuid' })
  fundingAccountId!: string;

  @Column({ type: 'varchar', length: 16 })
  currency!: string;

  @Column({ type: 'enum', enum: CardStatus, default: CardStatus.ACTIVE })
  status!: CardStatus;

  @Column({ type: 'enum', enum: CardType, default: CardType.VIRTUAL })
  type!: CardType;

  @Column({ type: 'varchar', length: 64 })
  provider!: string;

  @Column({ type: 'varchar', length: 128 })
  providerReference!: string;

  @Column({ type: 'varchar', length: 4 })
  last4!: string;
}
