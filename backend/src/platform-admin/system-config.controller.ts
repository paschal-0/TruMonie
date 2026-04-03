import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { User, UserRole } from '../users/entities/user.entity';
import { SetSystemConfigDto } from './dto/set-system-config.dto';
import { SystemConfigService } from './system-config.service';
import { AdminPermission } from './decorators/admin-permission.decorator';
import { AdminPermissionGuard } from './guards/admin-permission.guard';

@UseGuards(JwtAuthGuard, RolesGuard, AdminPermissionGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.OPERATIONS_MANAGER, UserRole.FINANCE_OFFICER)
@Controller('admin/system-config')
export class SystemConfigController {
  constructor(private readonly systemConfigService: SystemConfigService) {}

  @Get()
  @AdminPermission('SYSTEM_CONFIG', 'READ')
  list(@Query('config_key') configKey?: string) {
    return this.systemConfigService.list(configKey);
  }

  @Get(':configKey/active')
  @AdminPermission('SYSTEM_CONFIG', 'READ')
  active(@Param('configKey') configKey: string) {
    return this.systemConfigService.getActive(configKey);
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  @AdminPermission('SYSTEM_CONFIG', 'UPDATE')
  createDraft(@CurrentUser() user: User, @Body() dto: SetSystemConfigDto) {
    return this.systemConfigService.createDraft({
      configKey: dto.config_key,
      configValue: dto.config_value,
      description: dto.description,
      changedBy: user.id
    });
  }

  @Post(':id/activate')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @AdminPermission('SYSTEM_CONFIG', 'APPROVE')
  activate(@CurrentUser() user: User, @Param('id') id: string) {
    return this.systemConfigService.activate(id, user.id);
  }

  @Post(':configKey/rollback')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @AdminPermission('SYSTEM_CONFIG', 'APPROVE')
  rollback(@CurrentUser() user: User, @Param('configKey') configKey: string) {
    return this.systemConfigService.rollback(configKey, user.id);
  }
}
