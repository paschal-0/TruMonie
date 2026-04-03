import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';

import { NotificationsService } from '../notifications/notifications.service';
import { PendingAction, PendingActionStatus } from './entities/pending-action.entity';

@Injectable()
export class PendingActionsMonitorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PendingActionsMonitorService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @InjectRepository(PendingAction)
    private readonly pendingActionsRepo: Repository<PendingAction>,
    private readonly notificationsService: NotificationsService
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.expireOverdue().catch((error) => {
        this.logger.error(
          `Pending action expiry failed: ${error instanceof Error ? error.message : 'unknown'}`
        );
      });
    }, 60_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async expireOverdue() {
    const overdue = await this.pendingActionsRepo.find({
      where: {
        status: PendingActionStatus.PENDING,
        expiresAt: LessThan(new Date())
      },
      take: 200
    });
    for (const action of overdue) {
      action.status = PendingActionStatus.EXPIRED;
      action.resolvedAt = new Date();
      await this.pendingActionsRepo.save(action);
      await this.notificationsService.send(
        action.makerId,
        'ADMIN_ACTION_EXPIRED',
        `Pending action ${action.actionType} expired without approval`
      );
    }
    return { expired: overdue.length };
  }
}

