import { BadRequestException, Inject, Injectable } from '@nestjs/common';

import { Currency } from '../ledger/enums/currency.enum';
import { REDIS_CLIENT } from '../redis/redis.module';

interface RedisChain {
  incrby(key: string, value: string): RedisChain;
  expire(key: string, seconds: number): RedisChain;
  incr(key: string): RedisChain;
  exec(): Promise<unknown>;
}

interface RedisClient {
  get(key: string): Promise<string | null>;
  multi(): RedisChain;
}

@Injectable()
export class VelocityService {
  constructor(@Inject(REDIS_CLIENT) private readonly redisClient: RedisClient) {}

  async assertWithinLimits(userId: string, currency: Currency, amountMinor: string) {
    const dailyKey = `vel:${userId}:${currency}:daily`;
    const hourlyKey = `vel:${userId}:${currency}:hourly`;
    const countKey = `vel:${userId}:count:hourly`;

    const amt = BigInt(amountMinor);
    const daily = BigInt((await this.redisClient.get(dailyKey)) || '0');
    const hourly = BigInt((await this.redisClient.get(hourlyKey)) || '0');
    const count = parseInt((await this.redisClient.get(countKey)) || '0', 10);

    // Stubbed limits: daily 2,000,000 minor, hourly 1,000,000 minor, 20 tx/hour.
    const dailyLimit = 2_000_000n;
    const hourlyLimit = 1_000_000n;
    const countLimit = 20;

    if (daily + amt > dailyLimit) throw new BadRequestException('Daily velocity limit exceeded');
    if (hourly + amt > hourlyLimit) throw new BadRequestException('Hourly velocity limit exceeded');
    if (count + 1 > countLimit) throw new BadRequestException('Transaction count limit exceeded');

    await this.redisClient
      .multi()
      .incrby(dailyKey, amt.toString())
      .expire(dailyKey, 86_400)
      .incrby(hourlyKey, amt.toString())
      .expire(hourlyKey, 3_600)
      .incr(countKey)
      .expire(countKey, 3_600)
      .exec();
  }
}
