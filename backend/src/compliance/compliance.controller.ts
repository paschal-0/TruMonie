import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { User, UserRole } from '../users/entities/user.entity';
import { ListComplianceEventsDto } from './dto/list-compliance-events.dto';
import { ResolveComplianceEventDto } from './dto/resolve-compliance-event.dto';
import { ComplianceService } from './compliance.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.COMPLIANCE_OFFICER, UserRole.AUDITOR)
@Controller('compliance/events')
export class ComplianceController {
  constructor(private readonly complianceService: ComplianceService) {}

  @Get()
  list(@Query() dto: ListComplianceEventsDto) {
    return this.complianceService.list({
      eventType: dto.event_type,
      riskLevel: dto.risk_level,
      resolution: dto.resolution,
      limit: dto.limit
    });
  }

  @Patch(':id/resolve')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.COMPLIANCE_OFFICER)
  resolve(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: ResolveComplianceEventDto
  ) {
    return this.complianceService.resolve(id, {
      resolution: dto.resolution,
      resolvedBy: user.id,
      nfiuReported: dto.nfiu_reported,
      nfiuReportRef: dto.nfiu_report_ref
    });
  }
}
