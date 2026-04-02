'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

import { apiGet } from '@/lib/api';
import { getStoredToken } from '@/lib/auth';
import { ApiErrorShape } from '@/lib/types';

interface MerchantDetailsResponse {
  merchant: {
    id: string;
    business_name: string;
    merchant_code: string;
    business_type: string;
    status: string;
    category_code: string;
    settlement_bank?: string;
    settlement_account?: string;
  };
  owner?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phoneNumber?: string;
  };
  terminals: Array<{
    id: string;
    terminal_id: string;
    status: string;
    model?: string;
    is_online: boolean;
    last_heartbeat?: string;
  }>;
  settlements: Array<{
    id: string;
    reference: string;
    status: string;
    cycle: string;
    net_amount: number;
  }>;
  transactions: Array<{
    id: string;
    reference: string;
    status: string;
    channel: string;
    amount_minor: number;
    posted_at?: string;
  }>;
}

function formatMinor(amountMinor: number) {
  return `\u20A6${(amountMinor / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

export default function MerchantDetailsPage() {
  const params = useParams<{ id: string }>();
  const merchantId = params?.id;
  const [data, setData] = useState<MerchantDetailsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const token = getStoredToken();
      if (!token || !merchantId) return;
      setLoading(true);
      setError(null);
      try {
        const response = await apiGet<MerchantDetailsResponse>(`/admin/merchants/${merchantId}`, token);
        setData(response);
      } catch (err) {
        const shaped = err as ApiErrorShape;
        setError(shaped.message || 'Failed to load merchant details');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [merchantId]);

  return (
    <>
      <h1>Merchant Details</h1>
      {error ? <div className="card error">{error}</div> : null}
      {loading ? <div className="card">Loading details...</div> : null}

      {data ? (
        <>
          <div className="card">
            <h2 style={{ marginTop: 0 }}>{data.merchant.business_name}</h2>
            <p className="muted">
              {data.merchant.merchant_code} | {data.merchant.business_type} | {data.merchant.status}
            </p>
            <p className="muted">
              Owner: {data.owner?.firstName} {data.owner?.lastName} ({data.owner?.email ?? data.owner?.phoneNumber})
            </p>
            <p className="muted">
              Settlement: {data.merchant.settlement_bank ?? '-'} / {data.merchant.settlement_account ?? '-'}
            </p>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Terminals</h3>
            <table>
              <thead>
                <tr>
                  <th>Terminal ID</th>
                  <th>Status</th>
                  <th>Model</th>
                  <th>Online</th>
                  <th>Last Heartbeat</th>
                </tr>
              </thead>
              <tbody>
                {data.terminals.map((item) => (
                  <tr key={item.id}>
                    <td>{item.terminal_id}</td>
                    <td>{item.status}</td>
                    <td>{item.model ?? '-'}</td>
                    <td>{item.is_online ? 'Yes' : 'No'}</td>
                    <td>{item.last_heartbeat ? new Date(item.last_heartbeat).toLocaleString() : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Settlements</h3>
            <table>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Cycle</th>
                  <th>Status</th>
                  <th>Net Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.settlements.map((item) => (
                  <tr key={item.id}>
                    <td>{item.reference}</td>
                    <td>{item.cycle}</td>
                    <td>{item.status}</td>
                    <td>{formatMinor(item.net_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Recent Transactions</h3>
            <table>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Status</th>
                  <th>Channel</th>
                  <th>Amount</th>
                  <th>Posted At</th>
                </tr>
              </thead>
              <tbody>
                {data.transactions.map((item) => (
                  <tr key={item.id}>
                    <td>{item.reference}</td>
                    <td>{item.status}</td>
                    <td>{item.channel}</td>
                    <td>{formatMinor(item.amount_minor)}</td>
                    <td>{item.posted_at ? new Date(item.posted_at).toLocaleString() : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </>
  );
}

