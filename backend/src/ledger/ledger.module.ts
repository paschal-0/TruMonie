import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { LedgerService } from './ledger.service';
import { LedgerController } from './ledger.controller';
import { Account } from './entities/account.entity';
import { JournalEntry } from './entities/journal-entry.entity';
import { JournalLine } from './entities/journal-line.entity';
import { GlAccount } from './entities/gl-account.entity';
import { GlPosting } from './entities/gl-posting.entity';
import { WalletEvent } from './entities/wallet-event.entity';
import { WalletTransaction } from './entities/wallet-transaction.entity';
import { VirtualAccount } from './entities/virtual-account.entity';
import { ProfitSharingPool } from './entities/profit-sharing-pool.entity';
import { ProfitDistribution } from './entities/profit-distribution.entity';
import { AccountsService } from './accounts.service';
import { WalletsController } from './wallets.controller';
import { AccountsPolicy } from './accounts.policy';
import { UsersModule } from '../users/users.module';
import { User } from '../users/entities/user.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { WalletEventsService } from './wallet-events.service';
import { CoreBankingController } from './core-banking.controller';
import { CoreBankingService } from './core-banking.service';
import { RolesGuard } from '../common/guards/roles.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Account,
      JournalEntry,
      JournalLine,
      GlAccount,
      GlPosting,
      WalletTransaction,
      WalletEvent,
      VirtualAccount,
      ProfitSharingPool,
      ProfitDistribution,
      User
    ]),
    UsersModule,
    NotificationsModule
  ],
  providers: [
    LedgerService,
    AccountsService,
    AccountsPolicy,
    WalletEventsService,
    CoreBankingService,
    RolesGuard
  ],
  controllers: [LedgerController, WalletsController, CoreBankingController],
  exports: [LedgerService, AccountsService, AccountsPolicy, WalletEventsService, CoreBankingService]
})
export class LedgerModule {}
