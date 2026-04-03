import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';
import { User } from '../../users/entities/user.entity';

export enum AuditActorType {
  USER = 'USER',
  ADMIN = 'ADMIN',
  SYSTEM = 'SYSTEM'
}

export enum AuditActionType {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  VIEW = 'VIEW'
}

@Entity({ name: 'audit_logs' })
export class AuditLog extends BaseEntity {
  @Column({ type: 'uuid', nullable: true })
  userId!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'user_id' })
  user!: User | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  eventType!: string | null;

  @Column({ type: 'enum', enum: AuditActorType, default: AuditActorType.USER })
  actorType!: AuditActorType;

  @Column({ type: 'varchar', length: 50, default: 'SYSTEM' })
  resourceType!: string;

  @Column({ type: 'uuid' })
  resourceId!: string;

  @Column({ type: 'enum', enum: AuditActionType, default: AuditActionType.UPDATE })
  actionType!: AuditActionType;

  @Column({ type: 'jsonb', nullable: true })
  beforeState!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  afterState!: Record<string, unknown> | null;

  @Column({ type: 'inet', nullable: true })
  ipAddress!: string | null;

  @Column({ type: 'text', nullable: true })
  userAgent!: string | null;

  @Column({ type: 'uuid' })
  correlationId!: string;

  @Column({ type: 'varchar', length: 64 })
  action!: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;
}
