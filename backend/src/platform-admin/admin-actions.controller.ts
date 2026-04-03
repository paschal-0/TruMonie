import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { User, UserRole } from '../users/entities/user.entity';
import { CreatePendingActionDto } from './dto/create-pending-action.dto';
import { ResolvePendingActionDto } from './dto/resolve-pending-action.dto';
import { AdminActionsService } from './admin-actions.service';
import { AdminPermission } from './decorators/admin-permission.decorator';
import { AdminPermissionGuard } from './guards/admin-permission.guard';

@UseGuards(JwtAuthGuard, RolesGuard, AdminPermissionGuard)
@Roles(
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.COMPLIANCE_OFFICER,
  UserRole.OPERATIONS_MANAGER,
  UserRole.FINANCE_OFFICER,
  UserRole.CUSTOMER_SUPPORT
)
@Controller('admin/actions')
export class AdminActionsController {
  constructor(private readonly adminActionsService: AdminActionsService) {}

  @Post()
  @AdminPermission('ADMIN', 'UPDATE')
  create(@CurrentUser() maker: User, @Body() dto: CreatePendingActionDto) {
    return this.adminActionsService.create(maker, {
      actionType: dto.action_type,
      resourceType: dto.resource_type,
      resourceId: dto.resource_id,
      payload: dto.payload,
      reason: dto.reason
    });
  }

  @Get()
  @AdminPermission('ADMIN', 'READ')
  list(@Query('status') status?: string, @Query('action_type') actionType?: string) {
    return this.adminActionsService.list({ status, actionType });
  }

  @Post(':id/approve')
  @AdminPermission('ADMIN', 'APPROVE')
  approve(@CurrentUser() checker: User, @Param('id') id: string, @Body() dto: ResolvePendingActionDto) {
    return this.adminActionsService.approve(checker, id, dto.reason);
  }

  @Post(':id/reject')
  @AdminPermission('ADMIN', 'APPROVE')
  reject(@CurrentUser() checker: User, @Param('id') id: string, @Body() dto: ResolvePendingActionDto) {
    return this.adminActionsService.reject(checker, id, dto.reason);
  }
}
