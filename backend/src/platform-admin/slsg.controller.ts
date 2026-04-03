import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { User, UserRole } from '../users/entities/user.entity';
import {
  ListRegulatorySubmissionsDto,
  SubmitAttestationDto,
  SubmitIncidentReportDto,
  SubmitLicenseRenewalDto,
  SubmitPeriodicReturnDto
} from './dto/slsg-submission.dto';
import { SlsgService } from './slsg.service';
import { AdminPermission } from './decorators/admin-permission.decorator';
import { AdminPermissionGuard } from './guards/admin-permission.guard';

@UseGuards(JwtAuthGuard, RolesGuard, AdminPermissionGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.COMPLIANCE_OFFICER, UserRole.FINANCE_OFFICER)
@Controller('admin/slsg')
export class SlsgController {
  constructor(private readonly slsgService: SlsgService) {}

  @Get('submissions')
  @AdminPermission('SLSG', 'READ')
  list(@Query() query: ListRegulatorySubmissionsDto) {
    return this.slsgService.list({
      status: query.status,
      type: query.type
    });
  }

  @Post('licenses/renew')
  @AdminPermission('SLSG', 'CREATE')
  renewLicense(@CurrentUser() user: User, @Body() dto: SubmitLicenseRenewalDto) {
    return this.slsgService.submitLicenseRenewal(dto.payload, user.id);
  }

  @Post('returns/submit')
  @AdminPermission('SLSG', 'CREATE')
  submitReturn(@CurrentUser() user: User, @Body() dto: SubmitPeriodicReturnDto) {
    return this.slsgService.submitPeriodicReturn({
      reportType: dto.report_type,
      period: dto.period,
      data: dto.data,
      submittedBy: user.id
    });
  }

  @Post('incidents/report')
  @AdminPermission('SLSG', 'CREATE')
  reportIncident(@CurrentUser() user: User, @Body() dto: SubmitIncidentReportDto) {
    return this.slsgService.submitIncident(dto.payload, user.id);
  }

  @Post('attestations/submit')
  @AdminPermission('SLSG', 'CREATE')
  submitAttestation(@CurrentUser() user: User, @Body() dto: SubmitAttestationDto) {
    return this.slsgService.submitAttestation(dto.payload, user.id);
  }
}
