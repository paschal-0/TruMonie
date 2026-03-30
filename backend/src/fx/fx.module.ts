import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { LedgerModule } from '../ledger/ledger.module';
import { RedisModule } from '../redis/redis.module';
import { FxController } from './fx.controller';
import { FxService } from './fx.service';
import { StubFxProvider } from './providers/stub-fx.provider';
import { LicensedFxProvider } from './providers/licensed-fx.provider';
import { FX_PROVIDER } from './fx.constants';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [LedgerModule, RedisModule, UsersModule, NotificationsModule],
  controllers: [FxController],
  providers: [
    FxService,
    StubFxProvider,
    LicensedFxProvider,
    {
      provide: FX_PROVIDER,
      useFactory: (
        configService: ConfigService,
        stubProvider: StubFxProvider,
        licensedProvider: LicensedFxProvider
      ) => {
        const selected = configService.get<string>('integrations.defaultFxProvider', 'licensed');
        return selected === licensedProvider.name ? licensedProvider : stubProvider;
      },
      inject: [ConfigService, StubFxProvider, LicensedFxProvider]
    }
  ],
  exports: [FxService]
})
export class FxModule {}
