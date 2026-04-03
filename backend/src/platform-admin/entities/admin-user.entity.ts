import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';
import { UserRole } from '../../users/entities/user.entity';

@Entity({ name: 'admin_users' })
@Index(['email'], { unique: true })
@Index(['userId'], { unique: true })
export class AdminUser extends BaseEntity {
  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'enum', enum: UserRole, enumName: 'user_role_enum' })
  role!: UserRole;

  @Column({ type: 'varchar', length: 50, nullable: true })
  department!: string | null;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'boolean', default: true })
  mfaEnabled!: boolean;

  @Column({ type: 'timestamp with time zone', nullable: true })
  lastLoginAt!: Date | null;

  @Column({ type: 'varchar', length: 255, default: '' })
  passwordHash!: string;
}

