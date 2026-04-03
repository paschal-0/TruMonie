import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { User } from '../../users/entities/user.entity';
import { ADMIN_PERMISSION_KEY, AdminPermissionMeta } from '../decorators/admin-permission.decorator';
import { PlatformAdminRbacService } from '../platform-admin-rbac.service';

@Injectable()
export class AdminPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbacService: PlatformAdminRbacService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.getAllAndOverride<AdminPermissionMeta | undefined>(
      ADMIN_PERMISSION_KEY,
      [context.getHandler(), context.getClass()]
    );
    if (!meta) return true;
    const request = context.switchToHttp().getRequest<{ user?: User }>();
    const user = request.user;
    if (!user) return false;
    await this.rbacService.assertPermission(user, meta.resource, meta.action);
    return true;
  }
}

