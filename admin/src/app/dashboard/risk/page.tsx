'use client';

import { useEffect, useState } from 'react';

import { apiGet } from '@/lib/api';
import { getStoredToken } from '@/lib/auth';
import { ApiErrorShape } from '@/lib/types';

interface Overview {
  settlements: {
    failed: number;
    pending: number;
  };
  terminals: {
    pending: number;
  };
  merchants: {
    suspended: number;
    pending: number;
  };
}

interface ListResponse {
  total: number;
}

export default function RiskPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [failedSettlements, setFailedSettlements] = useState(0);
  const [suspendedTerminals, setSuspendedTerminals] = useState(0);

  useEffect(() => {
    const load = async () => {
      const token = getStoredToken();
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const [ov, failed, suspended] = await Promise.all([
          apiGet<Overview>('/admin/merchants/overview', token),
          apiGet<ListResponse>('/admin/merchants/settlements?status=FAILED&page=1&perPage=1', token),
          apiGet<ListResponse>('/admin/merchants/terminals?status=SUSPENDED&page=1&perPage=1', token)
        ]);
        setOverview(ov);
        setFailedSettlements(failed.total ?? 0);
        setSuspendedTerminals(suspended.total ?? 0);
      } catch (err) {
        const shaped = err as ApiErrorShape;
        setError(shaped.message || 'Failed to load risk metrics');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  return (
    <>
      <h1>Risk View</h1>
      {error ? <div className="card error">{error}</div> : null}
      {loading ? <div className="card">Loading risk data...</div> : null}
      {overview ? (
        <div className="grid kpi">
          <div className="card kpi-card">
            <h3>Failed Settlements</h3>
            <p>{failedSettlements}</p>
          </div>
          <div className="card kpi-card">
            <h3>Suspended Terminals</h3>
            <p>{suspendedTerminals}</p>
          </div>
          <div className="card kpi-card">
            <h3>Suspended Merchants</h3>
            <p>{overview.merchants.suspended}</p>
          </div>
          <div className="card kpi-card">
            <h3>Pending Merchants</h3>
            <p>{overview.merchants.pending}</p>
          </div>
          <div className="card kpi-card">
            <h3>Pending Settlements</h3>
            <p>{overview.settlements.pending}</p>
          </div>
          <div className="card kpi-card">
            <h3>Pending Terminals</h3>
            <p>{overview.terminals.pending}</p>
          </div>
        </div>
      ) : null}
    </>
  );
}

