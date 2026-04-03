import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';

import configuration from './src/config/configuration';
import { User } from './src/users/entities/user.entity';
import { Account } from './src/ledger/entities/account.entity';
import { JournalEntry } from './src/ledger/entities/journal-entry.entity';
import { JournalLine } from './src/ledger/entities/journal-line.entity';
import { RefreshToken } from './src/auth/entities/refresh-token.entity';
import { UserKycData } from './src/kyc/entities/user-kyc-data.entity';
import { FundingTransaction } from './src/payments/entities/funding-transaction.entity';
import { Payout } from './src/payments/entities/payout.entity';
import { BillPayment } from './src/bills/entities/bill-payment.entity';
import { BillValidation } from './src/bills/entities/bill-validation.entity';
import { SavingsGroup } from './src/ajo/entities/savings-group.entity';
import { GroupMember } from './src/ajo/entities/group-member.entity';
import { GroupContribution } from './src/ajo/entities/group-contribution.entity';
import { GroupPayout } from './src/ajo/entities/group-payout.entity';
import { GroupActivity } from './src/ajo/entities/group-activity.entity';
import { WebhookEvent } from './src/payments/entities/webhook-event.entity';
import { BillBeneficiary } from './src/bills/entities/bill-beneficiary.entity';
import { SavingsVault } from './src/savings/entities/savings-vault.entity';
import { SavingsTransaction } from './src/savings/entities/savings-transaction.entity';
import { Card } from './src/cards/entities/card.entity';
import { Notification } from './src/notifications/entities/notification.entity';
import { WalletEvent } from './src/ledger/entities/wallet-event.entity';
import { WalletTransaction } from './src/ledger/entities/wallet-transaction.entity';
import { VirtualAccount } from './src/ledger/entities/virtual-account.entity';
import { GlAccount } from './src/ledger/entities/gl-account.entity';
import { GlPosting } from './src/ledger/entities/gl-posting.entity';
import { ProfitSharingPool } from './src/ledger/entities/profit-sharing-pool.entity';
import { ProfitDistribution } from './src/ledger/entities/profit-distribution.entity';
import { Transfer } from './src/payments/entities/transfer.entity';
import { TransferBeneficiary } from './src/payments/entities/transfer-beneficiary.entity';
import { Merchant } from './src/merchant/entities/merchant.entity';
import { PosTerminal } from './src/merchant/entities/pos-terminal.entity';
import { Settlement } from './src/merchant/entities/settlement.entity';
import { MerchantTransaction } from './src/merchant/entities/merchant-transaction.entity';
import { Agent } from './src/agency/entities/agent.entity';
import { AgentExclusivity } from './src/agency/entities/agent-exclusivity.entity';
import { AgentWalletConfig } from './src/agency/entities/agent-wallet-config.entity';
import { AgentLimit } from './src/agency/entities/agent-limit.entity';
import { AgentTransaction } from './src/agency/entities/agent-transaction.entity';
import { AgentCommission } from './src/agency/entities/agent-commission.entity';
import { Permission } from './src/platform-admin/entities/permission.entity';
import { PendingAction } from './src/platform-admin/entities/pending-action.entity';
import { SystemConfig } from './src/platform-admin/entities/system-config.entity';
import { RegulatorySubmission } from './src/platform-admin/entities/regulatory-submission.entity';
import { AdminUser } from './src/platform-admin/entities/admin-user.entity';

dotenv.config();
const config = configuration();

const dataSource = new DataSource({
  type: 'postgres',
  host: config.database.host,
  port: config.database.port,
  username: config.database.username,
  password: config.database.password,
  database: config.database.name,
  ssl: config.database.ssl ? { rejectUnauthorized: false } : undefined,
  entities: [
    User,
    Account,
    JournalEntry,
    JournalLine,
    RefreshToken,
    UserKycData,
    FundingTransaction,
    Payout,
    BillPayment,
    BillValidation,
    SavingsGroup,
    GroupMember,
    GroupContribution,
    GroupPayout,
    GroupActivity,
    WebhookEvent,
    BillBeneficiary,
    SavingsVault,
    SavingsTransaction,
    Card,
    Notification,
    WalletEvent,
    WalletTransaction,
    VirtualAccount,
    GlAccount,
    GlPosting,
    ProfitSharingPool,
    ProfitDistribution,
    Transfer,
    TransferBeneficiary,
    Merchant,
    PosTerminal,
    Settlement,
    MerchantTransaction,
    Agent,
    AgentExclusivity,
    AgentWalletConfig,
    AgentLimit,
    AgentTransaction,
    AgentCommission,
    Permission,
    PendingAction,
    SystemConfig,
    RegulatorySubmission,
    AdminUser
  ],
  migrations: ['src/migrations/*.ts'],
  namingStrategy: undefined, // handled in entities; keep default for migrations
  synchronize: false
});

export default dataSource;
