import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AgencyService } from '../agency/agency.service';
import { AgentStatus } from '../agency/entities/agent.entity';
import { Currency } from '../ledger/enums/currency.enum';
import { Account } from '../ledger/entities/account.entity';
import { LedgerService } from '../ledger/ledger.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../risk/audit.service';
import { AuditActionType, AuditActorType } from '../risk/entities/audit-log.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { AdminErrorCode, AdminException } from './admin.errors';
import { PendingAction, PendingActionStatus } from './entities/pending-action.entity';
import { actionRequiresChecker } from './platform-admin.permissions';
import { PlatformAdminRbacService } from './platform-admin-rbac.service';
import { SystemConfigService } from './system-config.service';
import { ComplianceService } from '../compliance/compliance.service';
import { ComplianceRiskLevel } from '../compliance/entities/compliance-event.entity';

export enum AdminActionType {
  FREEZE_WALLET = 'FREEZE_WALLET',
  UNFREEZE_WALLET = 'UNFREEZE_WALLET',
  OVERRIDE_TRANSACTION_LIMIT = 'OVERRIDE_TRANSACTION_LIMIT',
  MANUAL_CREDIT = 'MANUAL_CREDIT',
  MANUAL_DEBIT = 'MANUAL_DEBIT',
  AGENT_SUSPENSION = 'AGENT_SUSPENSION',
  SYSTEM_CONFIG_CHANGE = 'SYSTEM_CONFIG_CHANGE',
  USER_ROLE_ASSIGNMENT = 'USER_ROLE_ASSIGNMENT'
}

@Injectable()
export class AdminActionsService {
  constructor(
    @InjectRepository(PendingAction)
    private readonly pendingActionsRepo: Repository<PendingAction>,
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
    private readonly ledgerService: LedgerService,
    private readonly agencyService: AgencyService,
    private readonly configService: ConfigService,
    private readonly rbacService: PlatformAdminRbacService,
    private readonly systemConfigService: SystemConfigService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    private readonly complianceService: ComplianceService
  ) {}

  async create(
    maker: User,
    input: {
      actionType: string;
      resourceType: string;
      resourceId: string;
      payload: Record<string, unknown>;
      reason: string;
    }
  ) {
    await this.assertMakerPermission(maker, input.actionType);

    const pending = await this.pendingActionsRepo.save(
      this.pendingActionsRepo.create({
        actionType: input.actionType.toUpperCase(),
        resourceType: input.resourceType.toUpperCase(),
        resourceId: input.resourceId,
        payload: input.payload,
        makerId: maker.id,
        makerReason: input.reason,
        checkerId: null,
        checkerReason: null,
        status: PendingActionStatus.PENDING,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        resolvedAt: null
      })
    );
    await this.auditService.record({
      actorId: maker.id,
      actorType: AuditActorType.ADMIN,
      eventType: 'ADMIN_ACTION_CREATED',
      actionType: AuditActionType.CREATE,
      resourceType: 'PENDING_ACTION',
      resourceId: pending.id,
      metadata: {
        actionType: pending.actionType,
        targetResourceType: pending.resourceType,
        targetResourceId: pending.resourceId
      }
    });
    await this.notificationsService.send(
      maker.id,
      'ADMIN_ACTION_PENDING',
      `Action ${pending.actionType} submitted and awaiting approval`
    );
    return this.toPayload(pending);
  }

  async list(params: { status?: string; actionType?: string }) {
    const qb = this.pendingActionsRepo.createQueryBuilder('a').orderBy('a.createdAt', 'DESC');
    if (params.status) qb.andWhere('a.status = :status', { status: params.status.toUpperCase() });
    if (params.actionType)
      qb.andWhere('a.actionType = :actionType', { actionType: params.actionType.toUpperCase() });
    const rows = await qb.getMany();
    return rows.map((row) => this.toPayload(row));
  }

  async approve(checker: User, actionId: string, reason: string) {
    const action = await this.pendingActionsRepo.findOne({ where: { id: actionId } });
    if (!action) {
      throw new AdminException(AdminErrorCode.ACTION_ALREADY_RESOLVED, 'Pending action not found');
    }
    this.assertResolvable(action);
    if (action.makerId === checker.id) {
      throw new AdminException(
        AdminErrorCode.MAKER_CHECKER_CONFLICT,
        'Maker cannot approve own action',
        HttpStatus.BAD_REQUEST
      );
    }
    await this.assertCheckerPermission(checker, action.actionType);

    await this.executeAction(action, checker.id);
    action.status = PendingActionStatus.APPROVED;
    action.checkerId = checker.id;
    action.checkerReason = reason;
    action.resolvedAt = new Date();
    await this.pendingActionsRepo.save(action);
    await this.auditService.record({
      actorId: checker.id,
      actorType: AuditActorType.ADMIN,
      eventType: 'ADMIN_ACTION_APPROVED',
      actionType: AuditActionType.UPDATE,
      resourceType: 'PENDING_ACTION',
      resourceId: action.id,
      metadata: { reason }
    });
    await this.notificationsService.send(
      action.makerId,
      'ADMIN_ACTION_APPROVED',
      `Action ${action.actionType} was approved`
    );
    await this.complianceService.emit({
      eventType: 'PRIVILEGED_ACTION_APPROVED',
      referenceId: action.id,
      userId: action.makerId,
      riskLevel: ComplianceRiskLevel.MEDIUM,
      details: {
        actionType: action.actionType,
        checkerId: checker.id
      }
    });
    return this.toPayload(action);
  }

  async reject(checker: User, actionId: string, reason: string) {
    const action = await this.pendingActionsRepo.findOne({ where: { id: actionId } });
    if (!action) {
      throw new AdminException(AdminErrorCode.ACTION_ALREADY_RESOLVED, 'Pending action not found');
    }
    this.assertResolvable(action);
    if (action.makerId === checker.id) {
      throw new AdminException(
        AdminErrorCode.MAKER_CHECKER_CONFLICT,
        'Maker cannot reject own action',
        HttpStatus.BAD_REQUEST
      );
    }
    await this.assertCheckerPermission(checker, action.actionType);

    action.status = PendingActionStatus.REJECTED;
    action.checkerId = checker.id;
    action.checkerReason = reason;
    action.resolvedAt = new Date();
    await this.pendingActionsRepo.save(action);
    await this.auditService.record({
      actorId: checker.id,
      actorType: AuditActorType.ADMIN,
      eventType: 'ADMIN_ACTION_REJECTED',
      actionType: AuditActionType.UPDATE,
      resourceType: 'PENDING_ACTION',
      resourceId: action.id,
      metadata: { reason }
    });
    await this.notificationsService.send(
      action.makerId,
      'ADMIN_ACTION_REJECTED',
      `Action ${action.actionType} was rejected`
    );
    return this.toPayload(action);
  }

  private assertResolvable(action: PendingAction) {
    if (action.status !== PendingActionStatus.PENDING) {
      throw new AdminException(
        AdminErrorCode.ACTION_ALREADY_RESOLVED,
        'Pending action already resolved',
        HttpStatus.CONFLICT
      );
    }
    if (action.expiresAt.getTime() < Date.now()) {
      throw new AdminException(
        AdminErrorCode.ACTION_EXPIRED,
        'Pending action expired',
        HttpStatus.BAD_REQUEST
      );
    }
  }

  private async assertMakerPermission(maker: User, actionType: string) {
    const map = this.permissionForAction(actionType);
    await this.rbacService.assertPermission(maker, map.resource, map.action);
  }

  private async assertCheckerPermission(checker: User, actionType: string) {
    const map = this.permissionForAction(actionType);
    if (checker.role === UserRole.SUPER_ADMIN || checker.role === UserRole.ADMIN) return;
    if (!actionRequiresChecker(actionType)) return;
    await this.rbacService.assertPermission(checker, map.resource, 'APPROVE');
  }

  private permissionForAction(actionType: string) {
    const upper = actionType.toUpperCase();
    if (upper === AdminActionType.FREEZE_WALLET || upper === AdminActionType.UNFREEZE_WALLET) {
      return { resource: 'WALLET_FREEZE', action: 'UPDATE' };
    }
    if (upper === AdminActionType.OVERRIDE_TRANSACTION_LIMIT) {
      return { resource: 'LIMIT_OVERRIDE', action: 'UPDATE' };
    }
    if (upper === AdminActionType.MANUAL_CREDIT || upper === AdminActionType.MANUAL_DEBIT) {
      return { resource: 'GL', action: 'UPDATE' };
    }
    if (upper === AdminActionType.AGENT_SUSPENSION) {
      return { resource: 'AGENT', action: 'UPDATE' };
    }
    if (upper === AdminActionType.SYSTEM_CONFIG_CHANGE) {
      return { resource: 'SYSTEM_CONFIG', action: 'UPDATE' };
    }
    if (upper === AdminActionType.USER_ROLE_ASSIGNMENT) {
      return { resource: 'USER_ROLE', action: 'UPDATE' };
    }
    return { resource: 'ADMIN', action: 'UPDATE' };
  }

  private async executeAction(action: PendingAction, checkerId: string) {
    switch (action.actionType) {
      case AdminActionType.FREEZE_WALLET:
        await this.freezeWallet(action.resourceId, String(action.payload.reason ?? 'Admin action'));
        return;
      case AdminActionType.UNFREEZE_WALLET:
        await this.unfreezeWallet(action.resourceId);
        return;
      case AdminActionType.OVERRIDE_TRANSACTION_LIMIT:
        await this.overrideLimit(action.resourceId, action.payload);
        return;
      case AdminActionType.MANUAL_CREDIT:
        await this.manualCredit(action.payload);
        return;
      case AdminActionType.MANUAL_DEBIT:
        await this.manualDebit(action.payload);
        return;
      case AdminActionType.AGENT_SUSPENSION:
        await this.suspendAgent(action.payload, checkerId);
        return;
      case AdminActionType.SYSTEM_CONFIG_CHANGE: {
        const key = String(action.payload.config_key ?? '');
        const value = (action.payload.config_value ?? {}) as Record<string, unknown>;
        const description = String(action.payload.description ?? '');
        const draft = await this.systemConfigService.createDraft({
          configKey: key,
          configValue: value,
          description,
          changedBy: action.makerId
        });
        await this.systemConfigService.activate(draft.id, checkerId);
        return;
      }
      case AdminActionType.USER_ROLE_ASSIGNMENT: {
        const userId = String(action.payload.user_id ?? '');
        const role = String(action.payload.role ?? '') as UserRole;
        const departmentRaw = action.payload.department;
        const department =
          typeof departmentRaw === 'string' && departmentRaw.trim().length > 0
            ? departmentRaw.trim()
            : null;
        await this.rbacService.assignRole(userId, role, department, checkerId);
        return;
      }
      default:
        throw new AdminException(
          AdminErrorCode.INVALID_SYSTEM_CONFIG_VALUE,
          `Unsupported admin action type: ${action.actionType}`
        );
    }
  }

  private async freezeWallet(accountId: string, reason: string) {
    const wallet = await this.accountRepo.findOne({ where: { id: accountId } });
    if (!wallet) {
      throw new AdminException(AdminErrorCode.INVALID_SYSTEM_CONFIG_VALUE, 'Wallet not found');
    }
    wallet.frozenAt = new Date();
    wallet.frozenReason = reason;
    await this.accountRepo.save(wallet);
  }

  private async unfreezeWallet(accountId: string) {
    const wallet = await this.accountRepo.findOne({ where: { id: accountId } });
    if (!wallet) {
      throw new AdminException(AdminErrorCode.INVALID_SYSTEM_CONFIG_VALUE, 'Wallet not found');
    }
    wallet.frozenAt = null;
    wallet.frozenReason = null;
    await this.accountRepo.save(wallet);
  }

  private async overrideLimit(accountId: string, payload: Record<string, unknown>) {
    const wallet = await this.accountRepo.findOne({ where: { id: accountId } });
    if (!wallet) {
      throw new AdminException(AdminErrorCode.INVALID_SYSTEM_CONFIG_VALUE, 'Wallet not found');
    }
    const dailyLimitMinor = BigInt(String(payload.daily_limit_minor ?? wallet.dailyLimitMinor));
    const maxBalance = payload.max_balance_minor;
    wallet.dailyLimitMinor = dailyLimitMinor.toString();
    wallet.maxBalanceMinor =
      maxBalance === null || maxBalance === undefined ? null : BigInt(String(maxBalance)).toString();
    await this.accountRepo.save(wallet);
  }

  private async manualCredit(payload: Record<string, unknown>) {
    const walletId = String(payload.wallet_id ?? '');
    const amountMinor = BigInt(String(payload.amount_minor ?? 0)).toString();
    const currency = String(payload.currency ?? Currency.NGN) as Currency;
    const source = this.configService.get<string>(`systemAccounts.treasury.${currency}`);
    if (!source) {
      throw new AdminException(
        AdminErrorCode.INVALID_SYSTEM_CONFIG_VALUE,
        `System treasury account missing for ${currency}`
      );
    }
    await this.ledgerService.transfer({
      sourceAccountId: source,
      destinationAccountId: walletId,
      amountMinor,
      currency,
      description: String(payload.description ?? 'Manual credit')
    });
  }

  private async manualDebit(payload: Record<string, unknown>) {
    const walletId = String(payload.wallet_id ?? '');
    const amountMinor = BigInt(String(payload.amount_minor ?? 0)).toString();
    const currency = String(payload.currency ?? Currency.NGN) as Currency;
    const destination = this.configService.get<string>(`systemAccounts.treasury.${currency}`);
    if (!destination) {
      throw new AdminException(
        AdminErrorCode.INVALID_SYSTEM_CONFIG_VALUE,
        `System treasury account missing for ${currency}`
      );
    }
    await this.ledgerService.transfer({
      sourceAccountId: walletId,
      destinationAccountId: destination,
      amountMinor,
      currency,
      description: String(payload.description ?? 'Manual debit')
    });
  }

  private async suspendAgent(payload: Record<string, unknown>, checkerId: string) {
    const agentId = String(payload.agent_id ?? '');
    const reason = String(payload.reason ?? 'Suspended by admin action');
    await this.agencyService.adminUpdateStatus(checkerId, agentId, {
      status: AgentStatus.SUSPENDED,
      reason
    });
  }

  private toPayload(row: PendingAction) {
    return {
      id: row.id,
      action_type: row.actionType,
      resource_type: row.resourceType,
      resource_id: row.resourceId,
      payload: row.payload,
      maker_id: row.makerId,
      maker_reason: row.makerReason,
      checker_id: row.checkerId,
      checker_reason: row.checkerReason,
      status: row.status,
      expires_at: row.expiresAt,
      resolved_at: row.resolvedAt,
      created_at: row.createdAt
    };
  }
}
