import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RolesGuard } from '../common/guards/roles.guard';
import { LedgerModule } from '../ledger/ledger.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RiskModule } from '../risk/risk.module';
import { User } from '../users/entities/user.entity';
import { MerchantAdminController } from './merchant-admin.controller';
import { MerchantController } from './merchant.controller';
import { PTSA_PROVIDER } from './merchant.constants';
import { MerchantService } from './merchant.service';
import { MerchantSettlementQueue } from './merchant.settlement.queue';
import { Merchant } from './entities/merchant.entity';
import { PosTerminal } from './entities/pos-terminal.entity';
import { Settlement } from './entities/settlement.entity';
import { MerchantTransaction } from './entities/merchant-transaction.entity';
import { InternalPtsaProvider } from './providers/internal-ptsa.provider';
import { LicensedPtsaProvider } from './providers/licensed-ptsa.provider';

@Module({
  imports: [
    LedgerModule,
    NotificationsModule,
    RiskModule,
    TypeOrmModule.forFeature([Merchant, PosTerminal, Settlement, MerchantTransaction, User])
  ],
  controllers: [MerchantController, MerchantAdminController],
  providers: [
    MerchantService,
    InternalPtsaProvider,
    LicensedPtsaProvider,
    MerchantSettlementQueue,
    {
      provide: PTSA_PROVIDER,
      inject: [ConfigService, InternalPtsaProvider, LicensedPtsaProvider],
      useFactory: (
        configService: ConfigService,
        internalProvider: InternalPtsaProvider,
        licensedProvider: LicensedPtsaProvider
      ) => {
        const name = configService.get<string>('integrations.defaultPtsaProvider', 'internal');
        if (name === 'licensed') {
          return licensedProvider;
        }
        return internalProvider;
      }
    },
    RolesGuard
  ],
  exports: [MerchantService]
})
export class MerchantModule {}
