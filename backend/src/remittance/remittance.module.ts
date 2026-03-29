import { Module } from '@nestjs/common';

import { LedgerModule } from '../ledger/ledger.module';
import { PaymentsModule } from '../payments/payments.module';
import { RemittanceController } from './remittance.controller';
import { RemittanceService } from './remittance.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [LedgerModule, PaymentsModule, UsersModule],
  controllers: [RemittanceController],
  providers: [RemittanceService],
  exports: [RemittanceService]
})
export class RemittanceModule {}
