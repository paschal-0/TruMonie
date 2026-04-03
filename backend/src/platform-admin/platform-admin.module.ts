import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AgencyModule } from '../agency/agency.module';
import { AuthModule } from '../auth/auth.module';
import { FraudAlert } from '../fraud/entities/fraud-alert.entity';
import { FraudTransactionEvent } from '../fraud/entities/fraud-transaction-event.entity';
import { Account } from '../ledger/entities/account.entity';
import { MerchantTransaction } from '../merchant/entities/merchant-transaction.entity';
import { Transfer } from '../payments/entities/transfer.entity';
import { AuditLog } from '../risk/entities/audit-log.entity';
import { RiskModule } from '../risk/risk.module';
import { User } from '../users/entities/user.entity';
import { ComplianceModule } from '../compliance/compliance.module';
import { ComplianceEvent } from '../compliance/entities/compliance-event.entity';
import { AdminActionsController } from './admin-actions.controller';
import { AdminActionsService } from './admin-actions.service';
import { AdminAuditService } from './admin-audit.service';
import { AdminUsersController } from './admin-users.controller';
import { AuditLogsController } from './audit-logs.controller';
import { AdminUser } from './entities/admin-user.entity';
import { PendingAction } from './entities/pending-action.entity';
import { Permission } from './entities/permission.entity';
import { RegulatorySubmission } from './entities/regulatory-submission.entity';
import { SystemConfig } from './entities/system-config.entity';
import { PlatformAdminBootstrapService } from './platform-admin.bootstrap.service';
import { PlatformDashboardController } from './platform-dashboard.controller';
import { PlatformDashboardService } from './platform-dashboard.service';
import { PlatformAdminRbacService } from './platform-admin-rbac.service';
import { SlsgController } from './slsg.controller';
import { SlsgCallbackController } from './slsg-callback.controller';
import { SlsgService } from './slsg.service';
import { SystemConfigController } from './system-config.controller';
import { SystemConfigService } from './system-config.service';
import { Agent } from '../agency/entities/agent.entity';
import { AgentTransaction } from '../agency/entities/agent-transaction.entity';
import { AgentWalletConfig } from '../agency/entities/agent-wallet-config.entity';
import { LedgerModule } from '../ledger/ledger.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { PendingActionsMonitorService } from './pending-actions-monitor.service';
import { AdminPermissionGuard } from './guards/admin-permission.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Permission,
      PendingAction,
      SystemConfig,
      RegulatorySubmission,
      AdminUser,
      User,
      Account,
      Transfer,
      MerchantTransaction,
      FraudAlert,
      FraudTransactionEvent,
      Agent,
      AgentTransaction,
      AgentWalletConfig,
      AuditLog,
      ComplianceEvent
    ]),
    UsersModule,
    AuthModule,
    LedgerModule,
    NotificationsModule,
    RiskModule,
    AgencyModule,
    ComplianceModule
  ],
  controllers: [
    AdminActionsController,
    SystemConfigController,
    PlatformDashboardController,
    AuditLogsController,
    AdminUsersController,
    SlsgController,
    SlsgCallbackController
  ],
  providers: [
    PlatformAdminBootstrapService,
    PlatformAdminRbacService,
    AdminActionsService,
    SystemConfigService,
    PlatformDashboardService,
    SlsgService,
    AdminAuditService,
    PendingActionsMonitorService,
    AdminPermissionGuard
  ]
})
export class PlatformAdminModule {}
