import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { LedgerModule } from '../ledger/ledger.module';
import { SavingsController } from './savings.controller';
import { SavingsService } from './savings.service';
import { SavingsVault } from './entities/savings-vault.entity';
import { SavingsTransaction } from './entities/savings-transaction.entity';

@Module({
  imports: [LedgerModule, TypeOrmModule.forFeature([SavingsVault, SavingsTransaction])],
  controllers: [SavingsController],
  providers: [SavingsService],
  exports: [SavingsService]
})
export class SavingsModule {}
