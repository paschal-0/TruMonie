'use client';

import { useEffect, useState } from 'react';

import { apiGet, apiPatch, apiPost } from '@/lib/api';
import { getStoredToken } from '@/lib/auth';
import { ApiErrorShape } from '@/lib/types';

interface TerminalRow {
  id: string;
  terminal_id: string;
  serial_number: string;
  model?: string;
  status: string;
  is_online: boolean;
  last_heartbeat?: string;
  merchant?: {
    business_name?: string;
    merchant_code?: string;
  };
}

interface TerminalResponse {
  items: TerminalRow[];
}

const statuses = ['ALL', 'PENDING', 'ACTIVE', 'INACTIVE', 'SUSPENDED'];

export default function TerminalsPage() {
  const [rows, setRows] = useState<TerminalRow[]>([]);
  const [status, setStatus] = useState('ALL');
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
      const response = await apiGet<TerminalResponse>(`/admin/merchants/terminals?${params.toString()}`, token);
      setRows(response.items ?? []);
    } catch (err) {
      const shaped = err as ApiErrorShape;
      setError(shaped.message || 'Failed to load terminals');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [status]);

  const updateStatus = async (id: string, nextStatus: string) => {
    const token = getStoredToken();
    if (!token) return;
    try {
      await apiPatch(`/admin/merchants/terminals/${id}/status`, { status: nextStatus }, token);
      await load();
    } catch (err) {
      const shaped = err as ApiErrorShape;
      setError(shaped.message || 'Terminal status update failed');
    }
  };

  const ping = async (id: string) => {
    const token = getStoredToken();
    if (!token) return;
    try {
      await apiPost(`/admin/merchants/terminals/${id}/heartbeat`, {}, token);
      await load();
    } catch (err) {
      const shaped = err as ApiErrorShape;
      setError(shaped.message || 'Heartbeat failed');
    }
  };

  return (
    <>
      <div className="topbar">
        <h1>Terminal Control</h1>
        <div className="row-actions">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {statuses.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <button className="secondary" onClick={() => void load()}>
            Refresh
          </button>
        </div>
      </div>
      {error ? <div className="card error">{error}</div> : null}
      {loading ? <div className="card">Loading terminals...</div> : null}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Terminal ID</th>
              <th>Merchant</th>
              <th>Status</th>
              <th>Online</th>
              <th>Last Heartbeat</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.terminal_id}</td>
                <td>{row.merchant?.business_name ?? '-'}</td>
                <td>{row.status}</td>
                <td>{row.is_online ? 'Yes' : 'No'}</td>
                <td>{row.last_heartbeat ? new Date(row.last_heartbeat).toLocaleString() : '-'}</td>
                <td>
                  <div className="row-actions">
                    <button onClick={() => void updateStatus(row.id, 'ACTIVE')}>Activate</button>
                    <button className="secondary" onClick={() => void updateStatus(row.id, 'INACTIVE')}>
                      Deactivate
                    </button>
                    <button className="danger" onClick={() => void updateStatus(row.id, 'SUSPENDED')}>
                      Suspend
                    </button>
                    <button className="secondary" onClick={() => void ping(row.id)}>
                      Heartbeat
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

