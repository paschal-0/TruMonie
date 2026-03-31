import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';

import { DeviceFingerprintDto } from '../auth/dto/device-fingerprint.dto';
import { AuditService } from './audit.service';
import { CircuitBreakerService } from './circuit-breaker.service';
import { DeviceStatus, UserDevice } from './entities/user-device.entity';

@Injectable()
export class DeviceBindingsService {
  constructor(
    @InjectRepository(UserDevice)
    private readonly userDeviceRepo: Repository<UserDevice>,
    private readonly auditService: AuditService,
    private readonly circuitBreakerService: CircuitBreakerService
  ) {}

  async bindDevice(userId: string, fingerprint: DeviceFingerprintDto, actorUserId: string) {
    const normalizedFingerprint = this.toFingerprintHash(fingerprint);
    const now = new Date();

    const active = await this.userDeviceRepo.findOne({
      where: { userId, status: DeviceStatus.ACTIVE },
      order: { updatedAt: 'DESC' }
    });
    if (active && active.fingerprint !== normalizedFingerprint) {
      throw new BadRequestException('Active device already exists. Use device transfer.');
    }

    const existing = await this.userDeviceRepo.findOne({
      where: { userId, fingerprint: normalizedFingerprint }
    });

    const saved = await this.userDeviceRepo.save(
      existing
        ? this.userDeviceRepo.merge(existing, {
            hardwareId: fingerprint.hardwareId,
            platform: fingerprint.platform,
            osVersion: fingerprint.osVersion,
            appVersion: fingerprint.appVersion,
            status: DeviceStatus.ACTIVE,
            boundAt: existing.boundAt ?? now,
            unboundAt: null,
            lastSeenAt: now
          })
        : this.userDeviceRepo.create({
            userId,
            fingerprint: normalizedFingerprint,
            hardwareId: fingerprint.hardwareId,
            platform: fingerprint.platform,
            osVersion: fingerprint.osVersion,
            appVersion: fingerprint.appVersion,
            status: DeviceStatus.ACTIVE,
            boundAt: now,
            unboundAt: null,
            lastSeenAt: now
          })
    );

    const breaker = await this.circuitBreakerService.activateNewDeviceCap(userId);
    await this.auditService.record(actorUserId, 'DEVICE_BIND', {
      userId,
      deviceId: saved.id,
      platform: saved.platform
    });

    return {
      bindingId: saved.id,
      status: 'ACTIVE',
      boundAt: saved.boundAt?.toISOString() ?? now.toISOString(),
      circuitBreaker: {
        active: true,
        expiresAt: breaker.expiresAt.toISOString(),
        maxTransactionAmount: Number(BigInt(breaker.maxAmountMinor) / 100n)
      }
    };
  }

  async transferDevice(userId: string, fingerprint: DeviceFingerprintDto, actorUserId: string) {
    const normalizedFingerprint = this.toFingerprintHash(fingerprint);
    const now = new Date();
    const active = await this.userDeviceRepo.findOne({
      where: { userId, status: DeviceStatus.ACTIVE },
      order: { updatedAt: 'DESC' }
    });

    if (!active) {
      throw new BadRequestException('No active device found for transfer.');
    }
    if (active.fingerprint === normalizedFingerprint) {
      throw new BadRequestException('New device must be different from current active device.');
    }

    await this.userDeviceRepo.update(
      { id: active.id },
      { status: DeviceStatus.INACTIVE, unboundAt: now, lastSeenAt: now }
    );

    const existingNew = await this.userDeviceRepo.findOne({
      where: { userId, fingerprint: normalizedFingerprint }
    });
    const newBinding = await this.userDeviceRepo.save(
      existingNew
        ? this.userDeviceRepo.merge(existingNew, {
            hardwareId: fingerprint.hardwareId,
            platform: fingerprint.platform,
            osVersion: fingerprint.osVersion,
            appVersion: fingerprint.appVersion,
            status: DeviceStatus.ACTIVE,
            boundAt: now,
            unboundAt: null,
            lastSeenAt: now
          })
        : this.userDeviceRepo.create({
            userId,
            fingerprint: normalizedFingerprint,
            hardwareId: fingerprint.hardwareId,
            platform: fingerprint.platform,
            osVersion: fingerprint.osVersion,
            appVersion: fingerprint.appVersion,
            status: DeviceStatus.ACTIVE,
            boundAt: now,
            unboundAt: null,
            lastSeenAt: now
          })
    );

    const breaker = await this.circuitBreakerService.activateNewDeviceCap(userId);
    await this.auditService.record(actorUserId, 'DEVICE_TRANSFER', {
      userId,
      oldDeviceId: active.id,
      newDeviceId: newBinding.id
    });

    return {
      oldBindingId: active.id,
      newBindingId: newBinding.id,
      circuitBreaker: {
        active: true,
        expiresAt: breaker.expiresAt.toISOString(),
        maxTransactionAmount: Number(BigInt(breaker.maxAmountMinor) / 100n)
      }
    };
  }

  private toFingerprintHash(fingerprint: DeviceFingerprintDto): string {
    const raw = [
      fingerprint.hardwareId,
      fingerprint.platform,
      fingerprint.osVersion,
      fingerprint.appVersion
    ]
      .map((value) => value.trim().toLowerCase())
      .join('|');
    return createHash('sha256').update(raw).digest('hex');
  }
}
