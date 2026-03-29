import { Inject, Injectable, OnModuleInit, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';

import { AjoService } from './ajo.service';
import { SavingsGroup } from './entities/savings-group.entity';

const QUEUE_NAME = 'ajo-cycle';
const REMINDER_QUEUE = 'ajo-reminder';

@Injectable()
export class AjoQueue implements OnModuleInit {
  private queue: Queue;
  private reminderQueue: Queue;

  constructor(
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => AjoService))
    private readonly ajoService: AjoService
  ) {
    const connection = {
      host: this.configService.get<string>('redis.host'),
      port: this.configService.get<number>('redis.port'),
      password: this.configService.get<string>('redis.password')
    };
    this.queue = new Queue(QUEUE_NAME, { connection });
    this.reminderQueue = new Queue(REMINDER_QUEUE, { connection });
    new Worker(
      QUEUE_NAME,
      async (job) => {
        await this.ajoService.runCycleInternal(job.data.groupId);
      },
      { connection }
    );
    new Worker(
      REMINDER_QUEUE,
      async (job) => {
        await this.ajoService.sendReminder(job.data.groupId);
      },
      { connection }
    );
  }

  onModuleInit() {
    // No-op; workers already initialized.
  }

  async scheduleCycle(group: SavingsGroup) {
    if (!group.nextPayoutDate) return;
    const delay = Math.max(1000, group.nextPayoutDate.getTime() - Date.now());
    await this.queue.add(`cycle-${group.id}-${group.nextPayoutDate.getTime()}`, { groupId: group.id }, { delay });
    await this.scheduleReminder(group);
  }

  async scheduleReminder(group: SavingsGroup) {
    if (!group.nextPayoutDate) return;
    const reminderTime = group.nextPayoutDate.getTime() - 24 * 60 * 60 * 1000;
    if (reminderTime <= Date.now()) return;
    const delay = reminderTime - Date.now();
    await this.reminderQueue.add(
      `reminder-${group.id}-${reminderTime}`,
      { groupId: group.id },
      { delay }
    );
  }
}
