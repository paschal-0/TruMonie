import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { BillsController } from './bills.controller';
import { BillsService } from './bills.service';
import { BillsAggregatorStub } from './providers/bills-aggregator.stub';
import { BillPayment } from './entities/bill-payment.entity';
import { BillBeneficiary } from './entities/bill-beneficiary.entity';
import { LedgerModule } from '../ledger/ledger.module';
import { BILLS_PROVIDER } from './bills.constants';
import { LicensedBillsProvider } from './providers/licensed-bills.provider';

@Module({
  imports: [LedgerModule, TypeOrmModule.forFeature([BillPayment, BillBeneficiary])],
  controllers: [BillsController],
  providers: [
    BillsService,
    BillsAggregatorStub,
    LicensedBillsProvider,
    {
      provide: BILLS_PROVIDER,
      useFactory: (
        configService: ConfigService,
        stubProvider: BillsAggregatorStub,
        licensedProvider: LicensedBillsProvider
      ) => {
        const selected = configService.get<string>('integrations.defaultBillsProvider', 'licensed');
        return selected === licensedProvider.name ? licensedProvider : stubProvider;
      },
      inject: [ConfigService, BillsAggregatorStub, LicensedBillsProvider]
    }
  ],
  exports: [BillsService]
})
export class BillsModule {}
