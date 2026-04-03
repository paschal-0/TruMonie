'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { getStoredToken, getStoredUser, isAdminRole } from '@/lib/auth';
import { AdminUser } from '@/lib/types';

const routeRoles: Array<{ prefix: string; roles: AdminUser['role'][] }> = [
  { prefix: '/dashboard/admin-users', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { prefix: '/dashboard/system-config', roles: ['ADMIN', 'SUPER_ADMIN', 'OPERATIONS_MANAGER', 'FINANCE_OFFICER'] },
  { prefix: '/dashboard/slsg', roles: ['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE_OFFICER', 'FINANCE_OFFICER'] },
  { prefix: '/dashboard/platform/fraud', roles: ['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE_OFFICER', 'AUDITOR'] },
  { prefix: '/dashboard/platform/reports', roles: ['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE_OFFICER', 'FINANCE_OFFICER', 'AUDITOR'] },
  { prefix: '/dashboard/compliance', roles: ['ADMIN', 'SUPER_ADMIN', 'COMPLIANCE_OFFICER', 'AUDITOR'] }
];

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = getStoredToken();
    const user = getStoredUser<AdminUser>();
    if (!token || !user || !isAdminRole(user.role)) {
      router.replace(`/login?next=${encodeURIComponent(pathname || '/dashboard')}`);
      return;
    }
    const restricted = routeRoles.find((item) => (pathname || '').startsWith(item.prefix));
    if (restricted && !restricted.roles.includes(user.role)) {
      router.replace('/dashboard');
      return;
    }
    setReady(true);
  }, [pathname, router]);

  if (!ready) {
    return <div className="card">Checking session...</div>;
  }
  return <>{children}</>;
}
