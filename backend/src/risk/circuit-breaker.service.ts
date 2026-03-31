import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CircuitBreaker, CircuitBreakerType } from './entities/circuit-breaker.entity';

@Injectable()
export class CircuitBreakerService {
  private static readonly NEW_DEVICE_CAP_MINOR = 2_000_000n; // NGN 20,000
  private static readonly NEW_DEVICE_WINDOW_HOURS = 24;

  constructor(
    @InjectRepository(CircuitBreaker)
    private readonly breakerRepo: Repository<CircuitBreaker>
  ) {}

  async activateNewDeviceCap(userId: string) {
    const now = new Date();
    await this.breakerRepo.update(
      { userId, type: CircuitBreakerType.NEW_DEVICE, isActive: true },
      { isActive: false }
    );
    const expiresAt = new Date(now.getTime() + CircuitBreakerService.NEW_DEVICE_WINDOW_HOURS * 3600 * 1000);
    const breaker = await this.breakerRepo.save(
      this.breakerRepo.create({
        userId,
        type: CircuitBreakerType.NEW_DEVICE,
        maxAmountMinor: CircuitBreakerService.NEW_DEVICE_CAP_MINOR.toString(),
        activatedAt: now,
        expiresAt,
        isActive: true
      })
    );
    return breaker;
  }

  async assertWithinNewDeviceCap(userId: string, amountMinor: string) {
    const active = await this.breakerRepo.findOne({
      where: { userId, type: CircuitBreakerType.NEW_DEVICE, isActive: true },
      order: { createdAt: 'DESC' }
    });
    if (!active) return;

    const now = new Date();
    if (active.expiresAt <= now) {
      await this.breakerRepo.update({ id: active.id }, { isActive: false });
      return;
    }

    if (BigInt(amountMinor) > BigInt(active.maxAmountMinor)) {
      throw new BadRequestException(
        `CIRCUIT_BREAKER_EXCEEDED: New device cap is ${active.maxAmountMinor} minor until ${active.expiresAt.toISOString()}`
      );
    }
  }

  async getActiveNewDeviceCap(userId: string) {
    return this.breakerRepo.findOne({
      where: { userId, type: CircuitBreakerType.NEW_DEVICE, isActive: true },
      order: { createdAt: 'DESC' }
    });
  }
}
