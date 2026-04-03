import { Controller, Get, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/entities/user.entity';
import { AdminPermission } from './decorators/admin-permission.decorator';
import { AdminPermissionGuard } from './guards/admin-permission.guard';
import { PlatformDashboardService } from './platform-dashboard.service';

@UseGuards(JwtAuthGuard, RolesGuard, AdminPermissionGuard)
@Roles(
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.OPERATIONS_MANAGER,
  UserRole.COMPLIANCE_OFFICER,
  UserRole.FINANCE_OFFICER,
  UserRole.AUDITOR
)
@Controller('admin/dashboards')
export class PlatformDashboardController {
  constructor(private readonly dashboardService: PlatformDashboardService) {}

  @Get('transactions')
  @AdminPermission('DASHBOARD', 'READ')
  transactions() {
    return this.dashboardService.transactionMonitoring();
  }

  @Get('fraud')
  @AdminPermission('FRAUD', 'READ')
  fraud() {
    return this.dashboardService.fraudControl();
  }

  @Get('agents')
  @AdminPermission('AGENT', 'READ')
  agents() {
    return this.dashboardService.agentPerformance();
  }

  @Get('analytics')
  @AdminPermission('DASHBOARD', 'READ')
  analytics() {
    return this.dashboardService.analyticsOverview();
  }
}
