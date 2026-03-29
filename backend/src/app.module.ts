import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from './auth/auth.module';
import configuration from './config/configuration';
import { validateEnv } from './config/validation';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { BillsModule } from './bills/bills.module';
import { AjoModule } from './ajo/ajo.module';
import { KycModule } from './kyc/kyc.module';
import { LedgerModule } from './ledger/ledger.module';
import { PaymentsModule } from './payments/payments.module';
import { RedisModule } from './redis/redis.module';
import { UsersModule } from './users/users.module';
import { NotificationsModule } from './notifications/notifications.module';
import { FxModule } from './fx/fx.module';
import { RemittanceModule } from './remittance/remittance.module';
import { SavingsModule } from './savings/savings.module';
import { RiskModule } from './risk/risk.module';
import { CardsModule } from './cards/cards.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv
    }),
    DatabaseModule,
    RedisModule,
    HealthModule,
    UsersModule,
    AuthModule,
    BillsModule,
    NotificationsModule,
    KycModule,
    LedgerModule,
    PaymentsModule,
    AjoModule,
    FxModule,
    RemittanceModule,
    SavingsModule,
    RiskModule,
    CardsModule
  ]
})
export class AppModule {}
