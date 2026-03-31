import { Body, Controller, Param, Patch, Post, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { User, UserRole, UserStatus } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { AuditService } from './audit.service';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { DeviceBindingsService } from './device-bindings.service';

@UseGuards(JwtAuthGuard)
@Controller('risk')
export class RiskController {
  constructor(
    private readonly usersService: UsersService,
    private readonly auditService: AuditService,
    private readonly deviceBindingsService: DeviceBindingsService
  ) {}

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch('user/:id/freeze')
  async freezeUser(@CurrentUser() requester: User, @Param('id') id: string) {
    await this.usersService.updateStatus(id, UserStatus.DISABLED);
    await this.auditService.record(requester.id, 'USER_FREEZE', { target: id });
    return { status: 'frozen' };
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch('user/:id/unfreeze')
  async unfreezeUser(@CurrentUser() requester: User, @Param('id') id: string) {
    await this.usersService.updateStatus(id, UserStatus.ACTIVE);
    await this.auditService.record(requester.id, 'USER_UNFREEZE', { target: id });
    return { status: 'unfrozen' };
  }

  @Post('device/register')
  async registerDevice(@CurrentUser() user: User, @Body() dto: RegisterDeviceDto) {
    const platform: 'android' | 'ios' =
      dto.platform === 'ios' || dto.platform === 'android'
        ? dto.platform
        : dto.deviceType?.toLowerCase().includes('ios')
        ? 'ios'
        : 'android';
    const response = await this.deviceBindingsService.bindDevice(
      user.id,
      {
        hardwareId: dto.fingerprint,
        platform,
        osVersion: dto.osVersion ?? 'unknown',
        appVersion: dto.appVersion ?? 'unknown'
      },
      user.id
    );
    return {
      status: 'ok',
      deviceId: response.bindingId,
      boundAt: response.boundAt,
      circuitBreaker: response.circuitBreaker
    };
  }
}
