import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { LedgerModule } from '../ledger/ledger.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaystackProvider } from './providers/paystack.provider';
import { FlutterwaveProvider } from './providers/flutterwave.provider';
import { InternalPaymentProvider } from './providers/internal.provider';
import { LicensedPaymentProvider } from './providers/licensed.provider';
import { Payout } from './entities/payout.entity';
import { FundingTransaction } from './entities/funding-transaction.entity';
import { WebhookEvent } from './entities/webhook-event.entity';
import { TransfersController } from './transfers.controller';
import { LimitsModule } from '../limits/limits.module';
import { UsersModule } from '../users/users.module';
import { RiskModule } from '../risk/risk.module';
import { PAYMENT_PROVIDERS } from './payments.constants';
import { RolesGuard } from '../common/guards/roles.guard';

@Module({
  imports: [
    LedgerModule,
    LimitsModule,
    UsersModule,
    RiskModule,
    TypeOrmModule.forFeature([Payout, FundingTransaction, WebhookEvent])
  ],
  controllers: [PaymentsController, TransfersController],
  providers: [
    PaymentsService,
    RolesGuard,
    PaystackProvider,
    FlutterwaveProvider,
    InternalPaymentProvider,
    LicensedPaymentProvider,
    {
      provide: PAYMENT_PROVIDERS,
      useFactory: (
        paystack: PaystackProvider,
        flutterwave: FlutterwaveProvider,
        internal: InternalPaymentProvider,
        licensed: LicensedPaymentProvider
      ) => [paystack, flutterwave, internal, licensed],
      inject: [PaystackProvider, FlutterwaveProvider, InternalPaymentProvider, LicensedPaymentProvider]
    }
  ],
  exports: [PaymentsService]
})
export class PaymentsModule {}
