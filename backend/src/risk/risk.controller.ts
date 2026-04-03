import { Body, Controller, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ComplianceService } from '../compliance/compliance.service';
import { ComplianceRiskLevel } from '../compliance/entities/compliance-event.entity';
import { User, UserRole, UserStatus } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { AuditService } from './audit.service';
import { AuditActorType } from './entities/audit-log.entity';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { DeviceBindingsService } from './device-bindings.service';

@UseGuards(JwtAuthGuard)
@Controller('risk')
export class RiskController {
  constructor(
    private readonly usersService: UsersService,
    private readonly auditService: AuditService,
    private readonly deviceBindingsService: DeviceBindingsService,
    private readonly complianceService: ComplianceService
  ) {}

  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @Patch('user/:id/freeze')
  async freezeUser(@CurrentUser() requester: User, @Param('id') id: string, @Req() req: Request) {
    await this.usersService.updateStatus(id, UserStatus.DISABLED);
    await this.auditService.record({
      actorId: requester.id,
      actorType: AuditActorType.ADMIN,
      eventType: 'USER_FREEZE',
      resourceType: 'USER',
      resourceId: id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
      metadata: { target: id }
    });
    await this.complianceService.emit({
      eventType: 'MANUAL_REVIEW',
      referenceId: id,
      userId: id,
      riskLevel: ComplianceRiskLevel.HIGH,
      details: {
        action: 'USER_FREEZE',
        performedBy: requester.id
      }
    });
    return { status: 'frozen' };
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @Patch('user/:id/unfreeze')
  async unfreezeUser(@CurrentUser() requester: User, @Param('id') id: string, @Req() req: Request) {
    await this.usersService.updateStatus(id, UserStatus.ACTIVE);
    await this.auditService.record({
      actorId: requester.id,
      actorType: AuditActorType.ADMIN,
      eventType: 'USER_UNFREEZE',
      resourceType: 'USER',
      resourceId: id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
      metadata: { target: id }
    });
    await this.complianceService.emit({
      eventType: 'MANUAL_REVIEW',
      referenceId: id,
      userId: id,
      riskLevel: ComplianceRiskLevel.MEDIUM,
      details: {
        action: 'USER_UNFREEZE',
        performedBy: requester.id
      }
    });
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
