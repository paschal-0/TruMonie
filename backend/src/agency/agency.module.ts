import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { LedgerModule } from '../ledger/ledger.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { AgencyAdminController } from './agency-admin.controller';
import { AgencyController } from './agency.controller';
import { AgencyService } from './agency.service';
import { AgentCommission } from './entities/agent-commission.entity';
import { AgentExclusivity } from './entities/agent-exclusivity.entity';
import { AgentLimit } from './entities/agent-limit.entity';
import { Agent } from './entities/agent.entity';
import { AgentTransaction } from './entities/agent-transaction.entity';
import { AgentWalletConfig } from './entities/agent-wallet-config.entity';
import { Account } from '../ledger/entities/account.entity';
import { User } from '../users/entities/user.entity';
import { RolesGuard } from '../common/guards/roles.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Agent,
      AgentExclusivity,
      AgentWalletConfig,
      AgentLimit,
      AgentTransaction,
      AgentCommission,
      Account,
      User
    ]),
    LedgerModule,
    UsersModule,
    NotificationsModule
  ],
  providers: [AgencyService, RolesGuard],
  controllers: [AgencyController, AgencyAdminController],
  exports: [AgencyService]
})
export class AgencyModule {}

