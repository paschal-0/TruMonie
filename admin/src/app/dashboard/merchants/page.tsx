'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { apiGet, apiPatch } from '@/lib/api';
import { getStoredToken } from '@/lib/auth';
import { ApiErrorShape } from '@/lib/types';

interface MerchantRow {
  id: string;
  business_name: string;
  merchant_code: string;
  business_type: string;
  status: string;
  settlement_bank?: string;
  settlement_account?: string;
  owner?: {
    email?: string;
    phoneNumber?: string;
  };
}

interface MerchantResponse {
  page: number;
  perPage: number;
  total: number;
  items: MerchantRow[];
}

const statuses = ['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'];

export default function MerchantsPage() {
  const [rows, setRows] = useState<MerchantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');
  const [total, setTotal] = useState(0);

  const load = async () => {
    const token = getStoredToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', '1');
      params.set('perPage', '100');
      if (status !== 'ALL') params.set('status', status);
      if (query.trim()) params.set('query', query.trim());
      const response = await apiGet<MerchantResponse>(`/admin/merchants?${params.toString()}`, token);
      setRows(response.items ?? []);
      setTotal(response.total ?? 0);
    } catch (err) {
      const shaped = err as ApiErrorShape;
      setError(shaped.message || 'Failed to load merchants');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [status]);

  const updateStatus = async (merchantId: string, nextStatus: string) => {
    const token = getStoredToken();
    if (!token) return;
    const reason = window.prompt(`Optional reason for setting status to ${nextStatus}:`) ?? undefined;
    try {
      await apiPatch(`/admin/merchants/${merchantId}/status`, { status: nextStatus, reason }, token);
      await load();
    } catch (err) {
      const shaped = err as ApiErrorShape;
      setError(shaped.message || 'Status update failed');
    }
  };

  return (
    <>
      <div className="topbar">
        <h1>Merchant Queue</h1>
        <button className="secondary" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      <div className="card">
        <div className="grid" style={{ gridTemplateColumns: '1fr 180px 120px', alignItems: 'end' }}>
          <div className="form-row" style={{ marginTop: 0 }}>
            <label>Search</label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Business name, code, TIN"
            />
          </div>
          <div className="form-row" style={{ marginTop: 0 }}>
            <label>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {statuses.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <button onClick={() => void load()}>Apply</button>
        </div>
      </div>

      {error ? <div className="card error">{error}</div> : null}
      {loading ? <div className="card">Loading merchants...</div> : null}

      <div className="card">
        <p className="muted small" style={{ marginTop: 0 }}>
          Total records: {total}
        </p>
        <table>
          <thead>
            <tr>
              <th>Business</th>
              <th>Code</th>
              <th>Type</th>
              <th>Status</th>
              <th>Owner</th>
              <th>Settlement</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link href={`/dashboard/merchants/${row.id}`}>{row.business_name}</Link>
                </td>
                <td>{row.merchant_code}</td>
                <td>{row.business_type}</td>
                <td>
                  <span className="pill">{row.status}</span>
                </td>
                <td>{row.owner?.email ?? row.owner?.phoneNumber ?? '-'}</td>
                <td>
                  {row.settlement_bank ?? '-'} / {row.settlement_account ?? '-'}
                </td>
                <td>
                  <div className="row-actions">
                    <button onClick={() => void updateStatus(row.id, 'APPROVED')}>Approve</button>
                    <button className="secondary" onClick={() => void updateStatus(row.id, 'REJECTED')}>
                      Reject
                    </button>
                    <button className="danger" onClick={() => void updateStatus(row.id, 'SUSPENDED')}>
                      Suspend
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

