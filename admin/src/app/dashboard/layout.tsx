'use client';

import { AdminNav } from '@/components/AdminNav';
import { RequireAuth } from '@/components/RequireAuth';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <div className="layout">
        <AdminNav />
        <main className="content">{children}</main>
      </div>
    </RequireAuth>
  );
}

