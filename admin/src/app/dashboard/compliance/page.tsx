'use client';

import { FormEvent, useEffect, useState } from 'react';

import { apiGet, apiPatch } from '@/lib/api';
import { getStoredToken, getStoredUser } from '@/lib/auth';
import { AdminUser, ApiErrorShape } from '@/lib/types';

interface ComplianceEventRow {
  id: string;
  eventType: string;
  referenceId: string;
  userId: string | null;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  details: Record<string, unknown>;
  resolution: 'CLEARED' | 'ESCALATED' | 'REPORTED' | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  nfiuReported: boolean;
  nfiuReportRef: string | null;
  createdAt: string;
}

const riskLevels = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const resolutions = ['CLEARED', 'ESCALATED', 'REPORTED'];

export default function ComplianceEventsPage() {
  const [items, setItems] = useState<ComplianceEventRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [params, setParams] = useState({
    event_type: '',
    risk_level: '',
    resolution: '',
    limit: '50'
  });
  const [canResolve, setCanResolve] = useState(false);

  const load = async () => {
    const token = getStoredToken();
    if (!token) return;
    setError(null);
    try {
      const search = new URLSearchParams();
      if (params.event_type) search.set('event_type', params.event_type);
      if (params.risk_level) search.set('risk_level', params.risk_level);
      if (params.resolution) search.set('resolution', params.resolution);
      if (params.limit) search.set('limit', params.limit);
      const query = search.toString();
      const response = await apiGet<ComplianceEventRow[]>(
        `/compliance/events${query ? `?${query}` : ''}`,
        token
      );
      setItems(response ?? []);
    } catch (err) {
      const shaped = err as ApiErrorShape;
      setError(shaped.message || 'Failed to load compliance events');
    }
  };

  useEffect(() => {
    const user = getStoredUser<AdminUser>();
    if (user) {
      setCanResolve(
        user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' || user.role === 'COMPLIANCE_OFFICER'
      );
    }
    void load();
  }, []);

  const applyFilters = (event: FormEvent) => {
    event.preventDefault();
    void load();
  };

  const resolve = async (id: string, resolution: 'CLEARED' | 'ESCALATED' | 'REPORTED') => {
    if (!canResolve) return;
    const token = getStoredToken();
    if (!token) return;
    const nfiuReported = resolution === 'REPORTED';
    const nfiuReportRef = nfiuReported ? window.prompt('NFIU report reference', '') || undefined : undefined;
    setError(null);
    setNotice(null);
    try {
      await apiPatch(
        `/compliance/events/${id}/resolve`,
        {
          resolution,
          nfiu_reported: nfiuReported,
          ...(nfiuReportRef ? { nfiu_report_ref: nfiuReportRef } : {})
        },
        token
      );
      setNotice(`Compliance event marked as ${resolution}`);
      await load();
    } catch (err) {
      const shaped = err as ApiErrorShape;
      setError(shaped.message || 'Failed to resolve compliance event');
    }
  };

  return (
    <>
      <div className="topbar">
        <h1>Compliance Events</h1>
        <button className="secondary" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      <form className="card" onSubmit={applyFilters}>
        <div className="row-actions">
          <input
            placeholder="Event Type"
            value={params.event_type}
            onChange={(e) => setParams((prev) => ({ ...prev, event_type: e.target.value }))}
          />
          <select
            value={params.risk_level}
            onChange={(e) => setParams((prev) => ({ ...prev, risk_level: e.target.value }))}
          >
            <option value="">All Risk Levels</option>
            {riskLevels.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select
            value={params.resolution}
            onChange={(e) => setParams((prev) => ({ ...prev, resolution: e.target.value }))}
          >
            <option value="">All Resolutions</option>
            <option value="CLEARED">CLEARED</option>
            <option value="ESCALATED">ESCALATED</option>
            <option value="REPORTED">REPORTED</option>
          </select>
          <input
            type="number"
            min={1}
            max={200}
            value={params.limit}
            onChange={(e) => setParams((prev) => ({ ...prev, limit: e.target.value }))}
          />
          <button type="submit">Apply</button>
        </div>
      </form>

      {notice ? <div className="card success">{notice}</div> : null}
      {error ? <div className="card error">{error}</div> : null}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Event</th>
              <th>Risk</th>
              <th>Reference</th>
              <th>User</th>
              <th>Resolution</th>
              <th>Details</th>
              <th>Created</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.eventType}</td>
                <td>{item.riskLevel}</td>
                <td className="small">{item.referenceId}</td>
                <td className="small">{item.userId ?? '-'}</td>
                <td>{item.resolution ?? 'PENDING'}</td>
                <td className="small">{JSON.stringify(item.details)}</td>
                <td>{new Date(item.createdAt).toLocaleString()}</td>
                <td>
                  {!item.resolution && canResolve ? (
                    <div className="row-actions">
                      {resolutions.map((value) => (
                        <button
                          key={value}
                          className="secondary"
                          onClick={() => void resolve(item.id, value as 'CLEARED' | 'ESCALATED' | 'REPORTED')}
                        >
                          {value}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span className="muted small">{item.resolvedBy ?? '-'}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
