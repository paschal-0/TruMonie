import { Body, Controller, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { User , UserRole, UserStatus } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { AuditService } from './audit.service';
import { DeviceStatus, UserDevice } from './entities/user-device.entity';
import { RegisterDeviceDto } from './dto/register-device.dto';

@UseGuards(JwtAuthGuard)
@Controller('risk')
export class RiskController {
  constructor(
    private readonly usersService: UsersService,
    private readonly auditService: AuditService,
    @InjectRepository(UserDevice)
    private readonly userDeviceRepo: Repository<UserDevice>
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
    const now = new Date();
    const existing = await this.userDeviceRepo.findOne({
      where: { userId: user.id, fingerprint: dto.fingerprint }
    });

    const saved = await this.userDeviceRepo.save(
      existing
        ? this.userDeviceRepo.merge(existing, {
            status: DeviceStatus.ACTIVE,
            deviceType: dto.deviceType ?? existing.deviceType,
            lastSeenAt: now
          })
        : this.userDeviceRepo.create({
            userId: user.id,
            fingerprint: dto.fingerprint,
            deviceType: dto.deviceType ?? null,
            status: DeviceStatus.ACTIVE,
            lastSeenAt: now
          })
    );

    await this.auditService.record(user.id, 'DEVICE_REGISTER', {
      fingerprint: dto.fingerprint,
      deviceType: dto.deviceType,
      deviceId: saved.id
    });

    return {
      status: 'ok',
      deviceId: saved.id,
      lastSeenAt: saved.lastSeenAt
    };
  }
}
