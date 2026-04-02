'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { apiGet } from '@/lib/api';
import { getStoredToken } from '@/lib/auth';
import { ApiErrorShape } from '@/lib/types';

interface Overview {
  merchants: {
    total: number;
    pending: number;
    approved: number;
    suspended: number;
  };
  terminals: {
    total: number;
    active: number;
    pending: number;
  };
  settlements: {
    pending: number;
    failed: number;
  };
  transactions: {
    success_volume_today_minor: number;
  };
}

interface MerchantListResponse {
  items: Array<{
    id: string;
    business_name: string;
    merchant_code: string;
    status: string;
    owner?: {
      email?: string;
    };
  }>;
}

function formatMinor(amountMinor: number) {
  return `\u20A6${(amountMinor / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

export default function DashboardPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [recent, setRecent] = useState<MerchantListResponse['items']>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const token = getStoredToken();
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const [overviewRes, merchantRes] = await Promise.all([
          apiGet<Overview>('/admin/merchants/overview', token),
          apiGet<MerchantListResponse>('/admin/merchants?page=1&perPage=6', token)
        ]);
        setOverview(overviewRes);
        setRecent(merchantRes.items ?? []);
      } catch (err) {
        const shaped = err as ApiErrorShape;
        setError(shaped.message || 'Failed to load admin overview');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  return (
    <>
      <div className="topbar">
        <h1>Operations Overview</h1>
      </div>
      {error ? <div className="card error">{error}</div> : null}
      {loading ? <div className="card">Loading dashboard...</div> : null}
      {overview ? (
        <div className="grid kpi">
          <div className="card kpi-card">
            <h3>Total Merchants</h3>
            <p>{overview.merchants.total}</p>
          </div>
          <div className="card kpi-card">
            <h3>Pending Merchants</h3>
            <p>{overview.merchants.pending}</p>
          </div>
          <div className="card kpi-card">
            <h3>Active Terminals</h3>
            <p>{overview.terminals.active}</p>
          </div>
          <div className="card kpi-card">
            <h3>Pending Settlements</h3>
            <p>{overview.settlements.pending}</p>
          </div>
          <div className="card kpi-card">
            <h3>Failed Settlements</h3>
            <p>{overview.settlements.failed}</p>
          </div>
          <div className="card kpi-card">
            <h3>Today Success Volume</h3>
            <p>{formatMinor(overview.transactions.success_volume_today_minor)}</p>
          </div>
        </div>
      ) : null}

      <div className="card">
        <div className="topbar">
          <h2 style={{ margin: 0 }}>Recent Merchants</h2>
          <Link href="/dashboard/merchants" className="muted">
            View all
          </Link>
        </div>
        <table>
          <thead>
            <tr>
              <th>Business</th>
              <th>Code</th>
              <th>Status</th>
              <th>Owner</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {recent.map((item) => (
              <tr key={item.id}>
                <td>{item.business_name}</td>
                <td>{item.merchant_code}</td>
                <td>
                  <span className="pill">{item.status}</span>
                </td>
                <td>{item.owner?.email ?? '-'}</td>
                <td>
                  <Link href={`/dashboard/merchants/${item.id}`}>Open</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

