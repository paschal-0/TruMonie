import { Module } from '@nestjs/common';

import { LedgerModule } from '../ledger/ledger.module';
import { PaymentsModule } from '../payments/payments.module';
import { RemittanceController } from './remittance.controller';
import { RemittanceService } from './remittance.service';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [LedgerModule, PaymentsModule, UsersModule, NotificationsModule],
  controllers: [RemittanceController],
  providers: [RemittanceService],
  exports: [RemittanceService]
})
export class RemittanceModule {}
