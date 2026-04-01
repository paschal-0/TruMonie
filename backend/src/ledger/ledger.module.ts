import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { LedgerService } from './ledger.service';
import { LedgerController } from './ledger.controller';
import { Account } from './entities/account.entity';
import { JournalEntry } from './entities/journal-entry.entity';
import { JournalLine } from './entities/journal-line.entity';
import { WalletEvent } from './entities/wallet-event.entity';
import { WalletTransaction } from './entities/wallet-transaction.entity';
import { VirtualAccount } from './entities/virtual-account.entity';
import { AccountsService } from './accounts.service';
import { WalletsController } from './wallets.controller';
import { AccountsPolicy } from './accounts.policy';
import { UsersModule } from '../users/users.module';
import { User } from '../users/entities/user.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { WalletEventsService } from './wallet-events.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Account,
      JournalEntry,
      JournalLine,
      WalletTransaction,
      WalletEvent,
      VirtualAccount,
      User
    ]),
    UsersModule,
    NotificationsModule
  ],
  providers: [LedgerService, AccountsService, AccountsPolicy, WalletEventsService],
  controllers: [LedgerController, WalletsController],
  exports: [LedgerService, AccountsService, AccountsPolicy, WalletEventsService]
})
export class LedgerModule {}
