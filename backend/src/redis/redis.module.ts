import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const host = configService.get<string>('redis.host');
        const port = configService.get<number>('redis.port');
        const password = configService.get<string | undefined>('redis.password');
        return new Redis({
          host,
          port,
          password,
          lazyConnect: true,
          maxRetriesPerRequest: 3,
          reconnectOnError: () => true
        });
      }
    }
  ],
  exports: [REDIS_CLIENT]
})
export class RedisModule {}
