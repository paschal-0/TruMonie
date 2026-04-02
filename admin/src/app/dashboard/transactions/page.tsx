'use client';

import { useEffect, useState } from 'react';

import { apiGet } from '@/lib/api';
import { getStoredToken } from '@/lib/auth';
import { ApiErrorShape } from '@/lib/types';

interface TransactionRow {
  id: string;
  reference: string;
  status: string;
  channel: string;
  type: string;
  amount_minor: number;
  fee_minor: number;
  net_amount_minor: number;
  posted_at?: string;
  merchant?: {
    business_name?: string;
  };
}

interface TransactionsResponse {
  items: TransactionRow[];
}

const statuses = ['ALL', 'PENDING', 'SUCCESS', 'FAILED', 'REVERSED'];
const channels = ['ALL', 'CARD', 'TRANSFER', 'QR'];

function formatMinor(amountMinor: number) {
  return `\u20A6${(amountMinor / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

export default function TransactionsPage() {
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [status, setStatus] = useState('ALL');
  const [channel, setChannel] = useState('ALL');
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
      if (channel !== 'ALL') params.set('channel', channel);
      const response = await apiGet<TransactionsResponse>(`/admin/merchants/transactions?${params.toString()}`, token);
      setRows(response.items ?? []);
    } catch (err) {
      const shaped = err as ApiErrorShape;
      setError(shaped.message || 'Failed to load transactions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [status, channel]);

  return (
    <>
      <div className="topbar">
        <h1>Merchant Transactions</h1>
        <div className="row-actions">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {statuses.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select value={channel} onChange={(e) => setChannel(e.target.value)}>
            {channels.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <button className="secondary" onClick={() => void load()}>
            Refresh
          </button>
        </div>
      </div>

      {error ? <div className="card error">{error}</div> : null}
      {loading ? <div className="card">Loading transactions...</div> : null}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Reference</th>
              <th>Merchant</th>
              <th>Channel</th>
              <th>Status</th>
              <th>Amount</th>
              <th>Fee</th>
              <th>Net</th>
              <th>Posted At</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.reference}</td>
                <td>{row.merchant?.business_name ?? '-'}</td>
                <td>{row.channel}</td>
                <td>{row.status}</td>
                <td>{formatMinor(row.amount_minor)}</td>
                <td>{formatMinor(row.fee_minor)}</td>
                <td>{formatMinor(row.net_amount_minor)}</td>
                <td>{row.posted_at ? new Date(row.posted_at).toLocaleString() : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

