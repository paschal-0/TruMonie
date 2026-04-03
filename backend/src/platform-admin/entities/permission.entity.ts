import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';
import { UserRole } from '../../users/entities/user.entity';

export enum PermissionAction {
  READ = 'READ',
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  APPROVE = 'APPROVE'
}

@Entity({ name: 'permissions' })
@Index(['role', 'resource', 'action'], { unique: true })
export class Permission extends BaseEntity {
  @Column({ type: 'enum', enum: UserRole, enumName: 'user_role_enum' })
  role!: UserRole;

  @Column({ type: 'varchar', length: 50 })
  resource!: string;

  @Column({ type: 'enum', enum: PermissionAction, enumName: 'permission_action_enum' })
  action!: PermissionAction;

  @Column({ type: 'boolean', default: false })
  requiresChecker!: boolean;
}

