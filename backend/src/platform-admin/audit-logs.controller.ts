import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/entities/user.entity';
import { ListAuditLogsDto } from './dto/list-audit-logs.dto';
import { AdminAuditService } from './admin-audit.service';
import { AdminPermission } from './decorators/admin-permission.decorator';
import { AdminPermissionGuard } from './guards/admin-permission.guard';

@UseGuards(JwtAuthGuard, RolesGuard, AdminPermissionGuard)
@Roles(
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.AUDITOR,
  UserRole.COMPLIANCE_OFFICER,
  UserRole.OPERATIONS_MANAGER
)
@Controller('admin/audit-logs')
export class AuditLogsController {
  constructor(private readonly adminAuditService: AdminAuditService) {}

  @Get()
  @AdminPermission('AUDIT_LOG', 'READ')
  list(@Query() query: ListAuditLogsDto) {
    return this.adminAuditService.list({
      startDate: query.start_date,
      endDate: query.end_date,
      actorId: query.actor_id,
      actorType: query.actor_type,
      resourceType: query.resource_type,
      action: query.action,
      correlationId: query.correlation_id
    });
  }

  @Get('export.csv')
  @AdminPermission('REPORT_EXPORT', 'READ')
  async exportCsv(@Query() query: ListAuditLogsDto, @Res() res: Response) {
    const csv = await this.adminAuditService.exportCsv({
      startDate: query.start_date,
      endDate: query.end_date,
      actorId: query.actor_id,
      actorType: query.actor_type,
      resourceType: query.resource_type,
      action: query.action,
      correlationId: query.correlation_id
    });
    res.setHeader('content-type', 'text/csv');
    res.setHeader('content-disposition', 'attachment; filename="audit-logs.csv"');
    res.send(csv);
  }
}
