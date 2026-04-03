import { UserRole } from '../users/entities/user.entity';
import { PermissionAction } from './entities/permission.entity';

type PermissionSeed = {
  role: UserRole;
  resource: string;
  action: PermissionAction;
  requiresChecker?: boolean;
};

const checkerActions = new Set<string>([
  'WALLET_FREEZE',
  'WALLET_UNFREEZE',
  'LIMIT_OVERRIDE',
  'MANUAL_CREDIT',
  'MANUAL_DEBIT',
  'AGENT_SUSPEND',
  'SYSTEM_CONFIG_CHANGE',
  'USER_ROLE_ASSIGN'
]);

function permission(
  role: UserRole,
  resource: string,
  action: PermissionAction,
  requiresChecker = false
): PermissionSeed {
  return { role, resource, action, requiresChecker };
}

export const DEFAULT_PERMISSIONS: PermissionSeed[] = [
  permission(UserRole.ADMIN, 'ADMIN', PermissionAction.READ),
  permission(UserRole.ADMIN, 'ADMIN', PermissionAction.UPDATE),
  permission(UserRole.ADMIN, 'ADMIN', PermissionAction.APPROVE),
  permission(UserRole.ADMIN, 'SYSTEM_CONFIG', PermissionAction.READ),
  permission(UserRole.ADMIN, 'SYSTEM_CONFIG', PermissionAction.UPDATE),
  permission(UserRole.ADMIN, 'SYSTEM_CONFIG', PermissionAction.APPROVE, true),
  permission(UserRole.ADMIN, 'AUDIT_LOG', PermissionAction.READ),
  permission(UserRole.ADMIN, 'REPORT_EXPORT', PermissionAction.READ),
  permission(UserRole.ADMIN, 'DASHBOARD', PermissionAction.READ),
  permission(UserRole.ADMIN, 'FRAUD', PermissionAction.READ),
  permission(UserRole.ADMIN, 'AGENT', PermissionAction.READ),
  permission(UserRole.ADMIN, 'SLSG', PermissionAction.CREATE),
  permission(UserRole.ADMIN, 'SLSG', PermissionAction.READ),
  permission(UserRole.ADMIN, 'USER_ROLE', PermissionAction.UPDATE, true),
  permission(UserRole.SUPER_ADMIN, 'ADMIN', PermissionAction.APPROVE),
  permission(UserRole.SUPER_ADMIN, 'ADMIN', PermissionAction.READ),
  permission(UserRole.SUPER_ADMIN, 'ADMIN', PermissionAction.UPDATE),
  permission(UserRole.SUPER_ADMIN, 'AUDIT_LOG', PermissionAction.READ),
  permission(UserRole.SUPER_ADMIN, 'REPORT_EXPORT', PermissionAction.READ),
  permission(UserRole.SUPER_ADMIN, 'DASHBOARD', PermissionAction.READ),
  permission(UserRole.SUPER_ADMIN, 'FRAUD', PermissionAction.READ),
  permission(UserRole.SUPER_ADMIN, 'AGENT', PermissionAction.READ),
  permission(UserRole.SUPER_ADMIN, 'SLSG', PermissionAction.CREATE),
  permission(UserRole.SUPER_ADMIN, 'SLSG', PermissionAction.READ),
  permission(UserRole.SUPER_ADMIN, 'SYSTEM_CONFIG', PermissionAction.APPROVE, true),
  permission(UserRole.SUPER_ADMIN, 'SYSTEM_CONFIG', PermissionAction.READ),
  permission(UserRole.SUPER_ADMIN, 'SYSTEM_CONFIG', PermissionAction.UPDATE, true),
  permission(UserRole.SUPER_ADMIN, 'USER_ROLE', PermissionAction.APPROVE, true),
  permission(UserRole.SUPER_ADMIN, 'USER_ROLE', PermissionAction.UPDATE, true),
  permission(UserRole.COMPLIANCE_OFFICER, 'TRANSACTION', PermissionAction.READ),
  permission(UserRole.COMPLIANCE_OFFICER, 'FRAUD', PermissionAction.READ),
  permission(UserRole.COMPLIANCE_OFFICER, 'REGULATORY_REPORT', PermissionAction.CREATE),
  permission(UserRole.COMPLIANCE_OFFICER, 'SLSG', PermissionAction.CREATE),
  permission(UserRole.COMPLIANCE_OFFICER, 'SLSG', PermissionAction.READ),
  permission(UserRole.COMPLIANCE_OFFICER, 'DASHBOARD', PermissionAction.READ),
  permission(UserRole.COMPLIANCE_OFFICER, 'AUDIT_LOG', PermissionAction.READ),
  permission(UserRole.OPERATIONS_MANAGER, 'DASHBOARD', PermissionAction.READ),
  permission(UserRole.OPERATIONS_MANAGER, 'ADMIN', PermissionAction.READ),
  permission(UserRole.OPERATIONS_MANAGER, 'ADMIN', PermissionAction.UPDATE),
  permission(UserRole.OPERATIONS_MANAGER, 'AGENT', PermissionAction.UPDATE),
  permission(UserRole.OPERATIONS_MANAGER, 'AGENT', PermissionAction.READ),
  permission(UserRole.OPERATIONS_MANAGER, 'LIMIT_OVERRIDE', PermissionAction.UPDATE, true),
  permission(UserRole.OPERATIONS_MANAGER, 'SETTLEMENT', PermissionAction.UPDATE),
  permission(UserRole.OPERATIONS_MANAGER, 'SYSTEM_CONFIG', PermissionAction.READ),
  permission(UserRole.FINANCE_OFFICER, 'GL', PermissionAction.UPDATE),
  permission(UserRole.FINANCE_OFFICER, 'SETTLEMENT', PermissionAction.READ),
  permission(UserRole.FINANCE_OFFICER, 'FINANCIAL_REPORT', PermissionAction.CREATE),
  permission(UserRole.FINANCE_OFFICER, 'DASHBOARD', PermissionAction.READ),
  permission(UserRole.FINANCE_OFFICER, 'ADMIN', PermissionAction.READ),
  permission(UserRole.FINANCE_OFFICER, 'ADMIN', PermissionAction.UPDATE),
  permission(UserRole.FINANCE_OFFICER, 'SYSTEM_CONFIG', PermissionAction.READ),
  permission(UserRole.FINANCE_OFFICER, 'SYSTEM_CONFIG', PermissionAction.UPDATE, true),
  permission(UserRole.CUSTOMER_SUPPORT, 'CUSTOMER', PermissionAction.READ),
  permission(UserRole.CUSTOMER_SUPPORT, 'ADMIN', PermissionAction.READ),
  permission(UserRole.CUSTOMER_SUPPORT, 'ADMIN', PermissionAction.UPDATE),
  permission(UserRole.CUSTOMER_SUPPORT, 'PIN_RESET', PermissionAction.UPDATE, true),
  permission(UserRole.CUSTOMER_SUPPORT, 'WALLET_FREEZE', PermissionAction.UPDATE, true),
  permission(UserRole.CUSTOMER_SUPPORT, 'WALLET_UNFREEZE', PermissionAction.UPDATE, true),
  permission(UserRole.CUSTOMER_SUPPORT, 'TRANSACTION', PermissionAction.READ),
  permission(UserRole.AUDITOR, 'AUDIT_LOG', PermissionAction.READ),
  permission(UserRole.AUDITOR, 'COMPLIANCE', PermissionAction.READ),
  permission(UserRole.AUDITOR, 'REPORT_EXPORT', PermissionAction.READ),
  permission(UserRole.AUDITOR, 'DASHBOARD', PermissionAction.READ),
  permission(UserRole.AUDITOR, 'FRAUD', PermissionAction.READ),
  permission(UserRole.AUDITOR, 'AGENT', PermissionAction.READ)
];

export function actionRequiresChecker(actionType: string) {
  return checkerActions.has(actionType.toUpperCase());
}
