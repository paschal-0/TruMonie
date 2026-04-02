import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';

import { SettlementCycle } from './entities/settlement.entity';
import { MerchantService } from './merchant.service';

const QUEUE_NAME = 'merchant-settlement-cycle';

@Injectable()
export class MerchantSettlementQueue implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MerchantSettlementQueue.name);
  private readonly queue: Queue;
  private readonly worker: Worker;

  constructor(
    private readonly configService: ConfigService,
    private readonly merchantService: MerchantService
  ) {
    const connection = {
      host: this.configService.get<string>('redis.host'),
      port: this.configService.get<number>('redis.port'),
      password: this.configService.get<string>('redis.password')
    };

    this.queue = new Queue(QUEUE_NAME, { connection });
    this.worker = new Worker(
      QUEUE_NAME,
      async (job) => {
        const cycle = String(job.data?.cycle ?? '').toUpperCase();
        if (cycle !== SettlementCycle.T0 && cycle !== SettlementCycle.T1) {
          this.logger.warn(`Skipping settlement job with unsupported cycle: ${cycle}`);
          return;
        }
        const result = await this.merchantService.processSettlementCycle(cycle as SettlementCycle);
        this.logger.log(
          `Processed settlement cycle ${cycle}: settlements_created=${result.settlements_created}, transactions_linked=${result.transactions_linked}`
        );
      },
      { connection }
    );
  }

  async onModuleInit() {
    const queueEnabled = this.configService.get<boolean>('merchant.settlement.queueEnabled', true);
    if (!queueEnabled) {
      this.logger.log('Merchant settlement queue disabled by configuration.');
      return;
    }

    const t0Cron = this.configService.get<string>('merchant.settlement.t0Cron', '0 22 * * *');
    const t1Cron = this.configService.get<string>('merchant.settlement.t1Cron', '0 6 * * *');

    await this.queue.add(
      'merchant-settlement-t0',
      { cycle: SettlementCycle.T0 },
      {
        jobId: 'merchant-settlement-t0',
        repeat: { pattern: t0Cron },
        removeOnComplete: 20,
        removeOnFail: 50
      }
    );

    await this.queue.add(
      'merchant-settlement-t1',
      { cycle: SettlementCycle.T1 },
      {
        jobId: 'merchant-settlement-t1',
        repeat: { pattern: t1Cron },
        removeOnComplete: 20,
        removeOnFail: 50
      }
    );

    this.logger.log(`Merchant settlement schedules registered (T0: ${t0Cron}, T1: ${t1Cron})`);
  }

  async onModuleDestroy() {
    await this.worker.close();
    await this.queue.close();
  }
}
