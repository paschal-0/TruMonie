'use client';

import { FormEvent, useEffect, useState } from 'react';

import { apiGet } from '@/lib/api';
import { getStoredToken } from '@/lib/auth';
import { ApiErrorShape } from '@/lib/types';

interface AuditLogRow {
  id: string;
  event_type: string;
  actor: { id: string | null; type: string };
  resource: { type: string; id: string };
  action: string;
  correlation_id: string;
  created_at: string;
}

interface AuditResponse {
  logs: AuditLogRow[];
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useState({
    start_date: '',
    end_date: '',
    actor_id: '',
    actor_type: '',
    resource_type: '',
    action: '',
    correlation_id: ''
  });

  const load = async () => {
    const token = getStoredToken();
    if (!token) return;
    setError(null);
    try {
      const search = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value) search.set(key, value);
      }
      const response = await apiGet<AuditResponse>(
        `/admin/audit-logs${search.toString() ? `?${search.toString()}` : ''}`,
        token
      );
      setLogs(response.logs ?? []);
    } catch (err) {
      const shaped = err as ApiErrorShape;
      setError(shaped.message || 'Failed to load audit logs');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void load();
  };

  const exportCsv = () => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) search.set(key, value);
    }
    const query = search.toString();
    const token = getStoredToken();
    if (!token) return;
    const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api';
    const url = `${baseUrl}/admin/audit-logs/export.csv${query ? `?${query}` : ''}`;
    void fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((response) => response.blob())
      .then((blob) => {
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = 'audit-logs.csv';
        anchor.click();
        URL.revokeObjectURL(objectUrl);
      })
      .catch((error) => {
        setError(error instanceof Error ? error.message : 'Failed to export CSV');
      });
  };

  return (
    <>
      <div className="topbar">
        <h1>Audit Logs</h1>
        <div className="row-actions">
          <button className="secondary" onClick={() => void load()}>
            Refresh
          </button>
          <button className="secondary" onClick={exportCsv}>
            Export CSV
          </button>
        </div>
      </div>
      <form className="card" onSubmit={submit}>
        <div className="row-actions">
          <input
            type="date"
            value={params.start_date}
            onChange={(e) => setParams((prev) => ({ ...prev, start_date: e.target.value }))}
          />
          <input
            type="date"
            value={params.end_date}
            onChange={(e) => setParams((prev) => ({ ...prev, end_date: e.target.value }))}
          />
          <input
            placeholder="Actor ID"
            value={params.actor_id}
            onChange={(e) => setParams((prev) => ({ ...prev, actor_id: e.target.value }))}
          />
          <input
            placeholder="Resource Type"
            value={params.resource_type}
            onChange={(e) => setParams((prev) => ({ ...prev, resource_type: e.target.value }))}
          />
          <input
            placeholder="Correlation ID"
            value={params.correlation_id}
            onChange={(e) => setParams((prev) => ({ ...prev, correlation_id: e.target.value }))}
          />
          <button type="submit">Apply Filters</button>
        </div>
      </form>
      {error ? <div className="card error">{error}</div> : null}
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Event</th>
              <th>Actor</th>
              <th>Resource</th>
              <th>Action</th>
              <th>Correlation</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{log.event_type}</td>
                <td>
                  {log.actor.type}
                  <br />
                  <span className="muted small">{log.actor.id ?? 'SYSTEM'}</span>
                </td>
                <td>
                  {log.resource.type}
                  <br />
                  <span className="muted small">{log.resource.id}</span>
                </td>
                <td>{log.action}</td>
                <td>{log.correlation_id}</td>
                <td>{new Date(log.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
