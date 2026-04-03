'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { clearSession, getStoredUser } from '@/lib/auth';
import { AdminUser } from '@/lib/types';

type Role = AdminUser['role'];
type NavItem = { href: string; label: string; roles: Role[] };

const ALL_ADMIN_ROLES: Role[] = [
  'ADMIN',
  'SUPER_ADMIN',
  'COMPLIANCE_OFFICER',
  'OPERATIONS_MANAGER',
  'FINANCE_OFFICER',
  'CUSTOMER_SUPPORT',
  'AUDITOR'
];

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Overview', roles: ALL_ADMIN_ROLES },
  {
    href: '/dashboard/platform/transactions',
    label: 'Txn Monitor',
    roles: ['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE_OFFICER', 'OPERATIONS_MANAGER', 'FINANCE_OFFICER', 'AUDITOR']
  },
  {
    href: '/dashboard/platform/fraud',
    label: 'Fraud Control',
    roles: ['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE_OFFICER', 'AUDITOR']
  },
  {
    href: '/dashboard/platform/agents',
    label: 'Agent Performance',
    roles: ['ADMIN', 'SUPER_ADMIN', 'OPERATIONS_MANAGER', 'AUDITOR']
  },
  {
    href: '/dashboard/platform/reports',
    label: 'Reports',
    roles: ['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE_OFFICER', 'FINANCE_OFFICER', 'AUDITOR']
  },
  {
    href: '/dashboard/compliance',
    label: 'Compliance',
    roles: ['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE_OFFICER', 'AUDITOR']
  },
  {
    href: '/dashboard/actions',
    label: 'Maker Checker',
    roles: ['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE_OFFICER', 'OPERATIONS_MANAGER', 'FINANCE_OFFICER', 'CUSTOMER_SUPPORT']
  },
  {
    href: '/dashboard/system-config',
    label: 'System Config',
    roles: ['ADMIN', 'SUPER_ADMIN', 'OPERATIONS_MANAGER', 'FINANCE_OFFICER']
  },
  { href: '/dashboard/audit-logs', label: 'Audit Logs', roles: ['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE_OFFICER', 'AUDITOR'] },
  { href: '/dashboard/admin-users', label: 'Admin Users', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { href: '/dashboard/slsg', label: 'SLSG', roles: ['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE_OFFICER', 'FINANCE_OFFICER'] },
  { href: '/dashboard/merchants', label: 'Merchants', roles: ['ADMIN', 'SUPER_ADMIN', 'OPERATIONS_MANAGER'] },
  { href: '/dashboard/terminals', label: 'Terminals', roles: ['ADMIN', 'SUPER_ADMIN', 'OPERATIONS_MANAGER'] },
  { href: '/dashboard/settlements', label: 'Settlements', roles: ['ADMIN', 'SUPER_ADMIN', 'FINANCE_OFFICER', 'OPERATIONS_MANAGER'] },
  { href: '/dashboard/transactions', label: 'Transactions', roles: ['ADMIN', 'SUPER_ADMIN', 'FINANCE_OFFICER', 'COMPLIANCE_OFFICER', 'CUSTOMER_SUPPORT'] },
  { href: '/dashboard/risk', label: 'Risk View', roles: ['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE_OFFICER', 'OPERATIONS_MANAGER', 'AUDITOR'] }
];

export function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();
  const user = getStoredUser<AdminUser>();
  const visibleItems = navItems.filter((item) => (user ? item.roles.includes(user.role) : false));

  return (
    <aside className="sidebar">
      <div>
        <h2>TruMonie Admin</h2>
        <p className="muted">Merchant & POS Control</p>
      </div>
      <nav>
        {visibleItems.map((item) => (
          <Link
            key={item.href}
            className={`nav-link ${pathname === item.href ? 'active' : ''}`}
            href={item.href}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="sidebar-footer">
        <p className="muted small">
          {user ? `${user.firstName} ${user.lastName} (${user.role})` : 'Unknown admin'}
        </p>
        <button
          className="danger"
          onClick={() => {
            clearSession();
            router.replace('/login');
          }}
        >
          Logout
        </button>
      </div>
    </aside>
  );
}
