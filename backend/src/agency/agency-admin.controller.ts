import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { User, UserRole } from '../users/entities/user.entity';
import { AdminUpdateAgentStatusDto } from './dto/admin-update-agent-status.dto';
import { AgencyService } from './agency.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.OPERATIONS_MANAGER)
@Controller('admin/agents')
export class AgencyAdminController {
  constructor(private readonly agencyService: AgencyService) {}

  @Get('overview')
  overview() {
    return this.agencyService.adminOverview();
  }

  @Get(':id')
  details(@Param('id') id: string) {
    return this.agencyService.adminGetAgent(id);
  }

  @Patch(':id/status')
  @Roles(UserRole.SUPER_ADMIN)
  updateStatus(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: AdminUpdateAgentStatusDto
  ) {
    return this.agencyService.adminUpdateStatus(user.id, id, dto);
  }
}
