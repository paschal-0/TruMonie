'use client';

import { useEffect, useState } from 'react';

import { apiGet, apiPatch } from '@/lib/api';
import { getStoredToken } from '@/lib/auth';
import { ApiErrorShape } from '@/lib/types';

interface SettlementRow {
  id: string;
  reference: string;
  cycle: string;
  status: string;
  total_amount: number;
  total_fee: number;
  net_amount: number;
  transaction_count: number;
  merchant?: {
    business_name?: string;
  };
}

interface SettlementResponse {
  items: SettlementRow[];
}

const statuses = ['ALL', 'PENDING', 'PROCESSING', 'SETTLED', 'FAILED'];
const cycles = ['ALL', 'T0', 'T1'];

function formatMinor(amountMinor: number) {
  return `\u20A6${(amountMinor / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

export default function SettlementsPage() {
  const [rows, setRows] = useState<SettlementRow[]>([]);
  const [status, setStatus] = useState('ALL');
  const [cycle, setCycle] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const token = getStoredToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: '1', perPage: '100' });
      if (status !== 'ALL') params.set('status', status);
      if (cycle !== 'ALL') params.set('cycle', cycle);
      const response = await apiGet<SettlementResponse>(`/admin/merchants/settlements?${params.toString()}`, token);
      setRows(response.items ?? []);
    } catch (err) {
      const shaped = err as ApiErrorShape;
      setError(shaped.message || 'Failed to load settlements');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [status, cycle]);

  const updateStatus = async (id: string, nextStatus: string) => {
    const token = getStoredToken();
    if (!token) return;
    try {
      await apiPatch(`/admin/merchants/settlements/${id}/status`, { status: nextStatus }, token);
      await load();
    } catch (err) {
      const shaped = err as ApiErrorShape;
      setError(shaped.message || 'Settlement status update failed');
    }
  };

  return (
    <>
      <div className="topbar">
        <h1>Settlement Monitor</h1>
        <div className="row-actions">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {statuses.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select value={cycle} onChange={(e) => setCycle(e.target.value)}>
            {cycles.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <button className="secondary" onClick={() => void load()}>
            Refresh
          </button>
        </div>
      </div>

      {error ? <div className="card error">{error}</div> : null}
      {loading ? <div className="card">Loading settlements...</div> : null}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Reference</th>
              <th>Merchant</th>
              <th>Cycle</th>
              <th>Status</th>
              <th>Net Amount</th>
              <th>Txn Count</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.reference}</td>
                <td>{row.merchant?.business_name ?? '-'}</td>
                <td>{row.cycle}</td>
                <td>{row.status}</td>
                <td>{formatMinor(row.net_amount)}</td>
                <td>{row.transaction_count}</td>
                <td>
                  <div className="row-actions">
                    <button className="secondary" onClick={() => void updateStatus(row.id, 'PROCESSING')}>
                      Processing
                    </button>
                    <button onClick={() => void updateStatus(row.id, 'SETTLED')}>Settle</button>
                    <button className="danger" onClick={() => void updateStatus(row.id, 'FAILED')}>
                      Fail
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

