import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { LedgerModule } from '../ledger/ledger.module';
import { JournalLine } from '../ledger/entities/journal-line.entity';
import { LimitsService } from './limits.service';
import { SpendingService } from './spending.service';

@Module({
  imports: [LedgerModule, TypeOrmModule.forFeature([JournalLine])],
  providers: [LimitsService, SpendingService],
  exports: [LimitsService, SpendingService]
})
export class LimitsModule {}
