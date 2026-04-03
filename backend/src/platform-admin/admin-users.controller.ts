import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { User, UserRole } from '../users/entities/user.entity';
import { AdminActionsService, AdminActionType } from './admin-actions.service';
import { AssignRoleDto } from './dto/assign-role.dto';
import { UpdateAdminMfaDto, UpdateAdminStatusDto } from './dto/update-admin-status.dto';
import { PlatformAdminRbacService } from './platform-admin-rbac.service';
import { AuthService } from '../auth/auth.service';
import { AdminPermission } from './decorators/admin-permission.decorator';
import { AdminPermissionGuard } from './guards/admin-permission.guard';

@UseGuards(JwtAuthGuard, RolesGuard, AdminPermissionGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
@Controller('admin/users')
export class AdminUsersController {
  constructor(
    private readonly rbacService: PlatformAdminRbacService,
    private readonly adminActionsService: AdminActionsService,
    private readonly authService: AuthService
  ) {}

  @Get()
  @AdminPermission('ADMIN', 'READ')
  listAdminUsers() {
    return this.rbacService.listAdminUsers();
  }

  @Post(':id/role')
  @AdminPermission('USER_ROLE', 'UPDATE')
  assignRole(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: AssignRoleDto) {
    return this.adminActionsService.create(user, {
      actionType: AdminActionType.USER_ROLE_ASSIGNMENT,
      resourceType: 'USER',
      resourceId: id,
      payload: {
        user_id: id,
        role: dto.role,
        department: dto.department ?? null
      },
      reason: dto.reason
    });
  }

  @Post(':id/status')
  @AdminPermission('ADMIN', 'UPDATE')
  updateStatus(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: UpdateAdminStatusDto) {
    return this.rbacService.updateAdminStatus(id, dto.is_active, user.id);
  }

  @Post(':id/mfa')
  @AdminPermission('ADMIN', 'UPDATE')
  updateMfa(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: UpdateAdminMfaDto) {
    return this.rbacService.updateAdminMfa(id, dto.mfa_enabled, user.id);
  }

  @Post(':id/revoke-sessions')
  @AdminPermission('ADMIN', 'UPDATE')
  revokeSessions(@Param('id') id: string) {
    return this.authService.revokeAllSessions(id);
  }
}
