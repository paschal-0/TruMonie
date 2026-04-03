import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ROLES_KEY } from '../decorators/roles.decorator';
import { User, UserRole } from '../../users/entities/user.entity';
import { AdminErrorCode } from '../../platform-admin/admin.errors';

const ROLE_HIERARCHY: Record<string, string[]> = {
  [UserRole.SUPER_ADMIN]: [
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.COMPLIANCE_OFFICER,
    UserRole.OPERATIONS_MANAGER,
    UserRole.FINANCE_OFFICER,
    UserRole.CUSTOMER_SUPPORT,
    UserRole.AUDITOR
  ],
  [UserRole.ADMIN]: [
    UserRole.ADMIN,
    UserRole.COMPLIANCE_OFFICER,
    UserRole.OPERATIONS_MANAGER,
    UserRole.FINANCE_OFFICER,
    UserRole.CUSTOMER_SUPPORT,
    UserRole.AUDITOR
  ],
  [UserRole.COMPLIANCE_OFFICER]: [UserRole.COMPLIANCE_OFFICER],
  [UserRole.OPERATIONS_MANAGER]: [UserRole.OPERATIONS_MANAGER],
  [UserRole.FINANCE_OFFICER]: [UserRole.FINANCE_OFFICER],
  [UserRole.CUSTOMER_SUPPORT]: [UserRole.CUSTOMER_SUPPORT],
  [UserRole.AUDITOR]: [UserRole.AUDITOR],
  [UserRole.USER]: [UserRole.USER]
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }
    const request = context.switchToHttp().getRequest();
    const user: User | undefined = request.user;
    if (!user) {
      throw this.forbidden(request?.url);
    }
    const grants = ROLE_HIERARCHY[user.role] ?? [user.role];
    const allowed = requiredRoles.some((role) => grants.includes(role));
    if (!allowed) throw this.forbidden(request?.url);
    return true;
  }

  private forbidden(path?: string) {
    if (path?.includes('/admin/')) {
      return new ForbiddenException({
        code: AdminErrorCode.INSUFFICIENT_PERMISSIONS,
        message: 'Insufficient permissions'
      });
    }
    return new ForbiddenException('Insufficient role');
  }
}
