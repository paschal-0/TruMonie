'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { clearSession, getStoredUser } from '@/lib/auth';
import { AdminUser } from '@/lib/types';

const navItems = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/merchants', label: 'Merchants' },
  { href: '/dashboard/terminals', label: 'Terminals' },
  { href: '/dashboard/settlements', label: 'Settlements' },
  { href: '/dashboard/transactions', label: 'Transactions' },
  { href: '/dashboard/risk', label: 'Risk View' }
];

export function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();
  const user = getStoredUser<AdminUser>();

  return (
    <aside className="sidebar">
      <div>
        <h2>TruMonie Admin</h2>
        <p className="muted">Merchant & POS Control</p>
      </div>
      <nav>
        {navItems.map((item) => (
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

