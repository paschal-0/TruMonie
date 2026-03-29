import { Controller, Get, Inject } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { REDIS_CLIENT } from '../redis/redis.module';

@Controller()
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redisClient: { ping: () => Promise<string> }
  ) {}

  @Get('/health')
  async check() {
    const dbOk = await this.checkDatabase();
    const redisOk = await this.checkRedis();

    return {
      status: dbOk && redisOk ? 'ok' : 'degraded',
      checks: {
        database: dbOk,
        redis: redisOk
      }
    };
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      await this.dataSource.query('SELECT 1');
      return true;
    } catch (error) {
      return false;
    }
  }

  private async checkRedis(): Promise<boolean> {
    try {
      const res = await this.redisClient.ping();
      return res === 'PONG';
    } catch (error) {
      return false;
    }
  }
}
