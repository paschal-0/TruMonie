import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { User, UserRole } from '../users/entities/user.entity';
import { AdminErrorCode, AdminException } from './admin.errors';
import { AdminUser } from './entities/admin-user.entity';
import { Permission } from './entities/permission.entity';
import { DEFAULT_PERMISSIONS } from './platform-admin.permissions';

@Injectable()
export class PlatformAdminRbacService {
  constructor(
    @InjectRepository(Permission)
    private readonly permissionRepo: Repository<Permission>,
    @InjectRepository(AdminUser)
    private readonly adminUserRepo: Repository<AdminUser>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>
  ) {}

  async seedDefaultPermissions() {
    for (const seed of DEFAULT_PERMISSIONS) {
      const existing = await this.permissionRepo.findOne({
        where: {
          role: seed.role,
          resource: seed.resource,
          action: seed.action
        }
      });
      if (existing) {
        if (existing.requiresChecker !== Boolean(seed.requiresChecker)) {
          existing.requiresChecker = Boolean(seed.requiresChecker);
          await this.permissionRepo.save(existing);
        }
        continue;
      }
      await this.permissionRepo.save(
        this.permissionRepo.create({
          role: seed.role,
          resource: seed.resource,
          action: seed.action,
          requiresChecker: Boolean(seed.requiresChecker)
        })
      );
    }
    await this.syncAdminDirectory();
  }

  private async syncAdminDirectory() {
    const adminRoles = [
      UserRole.ADMIN,
      UserRole.SUPER_ADMIN,
      UserRole.COMPLIANCE_OFFICER,
      UserRole.OPERATIONS_MANAGER,
      UserRole.FINANCE_OFFICER,
      UserRole.CUSTOMER_SUPPORT,
      UserRole.AUDITOR
    ];
    const users = await this.userRepo.find({
      where: {
        role: In(adminRoles)
      }
    });
    for (const user of users) {
      const existing = await this.adminUserRepo.findOne({ where: { userId: user.id } });
      await this.adminUserRepo.save(
        this.adminUserRepo.create({
          ...(existing ?? {}),
          userId: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`.trim(),
          role: user.role,
          department: existing?.department ?? null,
          isActive: true,
          mfaEnabled: existing?.mfaEnabled ?? true,
          lastLoginAt: user.lastLoginAt,
          passwordHash: existing?.passwordHash ?? ''
        })
      );
    }
  }

  async assertPermission(
    actor: Pick<User, 'role'>,
    resource: string,
    action: string,
    fallbackAllowForSuperAdmin = true
  ) {
    const normalizedAction = action.toUpperCase();
    if (fallbackAllowForSuperAdmin && (actor.role === UserRole.SUPER_ADMIN || actor.role === UserRole.ADMIN)) {
      return;
    }

    const permission = await this.permissionRepo.findOne({
      where: {
        role: actor.role,
        resource: resource.toUpperCase(),
        action: normalizedAction as Permission['action']
      }
    });
    if (!permission) {
      throw new AdminException(
        AdminErrorCode.INSUFFICIENT_PERMISSIONS,
        'Insufficient permissions',
        HttpStatus.FORBIDDEN,
        {
          role: actor.role,
          resource: resource.toUpperCase(),
          action: normalizedAction
        }
      );
    }
  }

  async assignRole(
    userId: string,
    role: UserRole,
    department: string | null,
    changedBy: string
  ) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new AdminException(AdminErrorCode.INVALID_SYSTEM_CONFIG_VALUE, 'User not found');
    }
    user.role = role;
    await this.userRepo.save(user);

    const existingAdmin = await this.adminUserRepo.findOne({ where: { userId } });
    const admin = this.adminUserRepo.create({
      ...(existingAdmin ?? {}),
      userId,
      email: user.email,
      name: `${user.firstName} ${user.lastName}`.trim(),
      role,
      department: department?.trim() || null,
      isActive: true,
      mfaEnabled: existingAdmin?.mfaEnabled ?? true,
      lastLoginAt: user.lastLoginAt,
      passwordHash: existingAdmin?.passwordHash ?? ''
    });
    await this.adminUserRepo.save(admin);
    return { userId, role, department: admin.department, changedBy };
  }

  async listAdminUsers() {
    const rows = await this.adminUserRepo.find({
      order: { createdAt: 'DESC' }
    });
    return rows.map((row) => ({
      id: row.id,
      user_id: row.userId,
      email: row.email,
      name: row.name,
      role: row.role,
      department: row.department,
      is_active: row.isActive,
      mfa_enabled: row.mfaEnabled,
      last_login_at: row.lastLoginAt,
      created_at: row.createdAt
    }));
  }

  async updateAdminStatus(userId: string, isActive: boolean, changedBy: string) {
    const profile = await this.adminUserRepo.findOne({ where: { userId } });
    if (!profile) {
      throw new AdminException(AdminErrorCode.INVALID_SYSTEM_CONFIG_VALUE, 'Admin profile not found');
    }
    profile.isActive = isActive;
    await this.adminUserRepo.save(profile);
    return { userId, is_active: profile.isActive, changed_by: changedBy };
  }

  async updateAdminMfa(userId: string, enabled: boolean, changedBy: string) {
    const profile = await this.adminUserRepo.findOne({ where: { userId } });
    if (!profile) {
      throw new AdminException(AdminErrorCode.INVALID_SYSTEM_CONFIG_VALUE, 'Admin profile not found');
    }
    profile.mfaEnabled = enabled;
    await this.adminUserRepo.save(profile);
    return { userId, mfa_enabled: profile.mfaEnabled, changed_by: changedBy };
  }
}
