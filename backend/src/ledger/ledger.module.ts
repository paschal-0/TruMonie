import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { LedgerService } from './ledger.service';
import { LedgerController } from './ledger.controller';
import { Account } from './entities/account.entity';
import { JournalEntry } from './entities/journal-entry.entity';
import { JournalLine } from './entities/journal-line.entity';
import { AccountsService } from './accounts.service';
import { WalletsController } from './wallets.controller';
import { AccountsPolicy } from './accounts.policy';

@Module({
  imports: [TypeOrmModule.forFeature([Account, JournalEntry, JournalLine])],
  providers: [LedgerService, AccountsService, AccountsPolicy],
  controllers: [LedgerController, WalletsController],
  exports: [LedgerService, AccountsService, AccountsPolicy]
})
export class LedgerModule {}
