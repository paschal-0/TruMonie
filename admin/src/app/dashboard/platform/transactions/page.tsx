'use client';

import { useEffect, useState } from 'react';

import { apiGet } from '@/lib/api';
import { getStoredToken } from '@/lib/auth';
import { ApiErrorShape } from '@/lib/types';

interface MonitoringResponse {
  metrics: {
    today: {
      total_transactions: number;
      total_value: number;
      success_rate: number;
      avg_processing_time_ms: number;
      peak_tps: number;
      pending_count: number;
    };
    by_channel: Record<string, { count: number; value: number }>;
    failures: {
      total: number;
      by_reason: Record<string, number>;
    };
  };
}

function money(amountMinor: number) {
  return `\u20A6${(amountMinor / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

export default function TxnMonitorPage() {
  const [data, setData] = useState<MonitoringResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const token = getStoredToken();
    if (!token) return;
    setError(null);
    try {
      setData(await apiGet<MonitoringResponse>('/admin/dashboards/transactions', token));
    } catch (err) {
      const shaped = err as ApiErrorShape;
      setError(shaped.message || 'Failed to load transaction monitoring metrics');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const today = data?.metrics.today;
  const channels = data ? Object.entries(data.metrics.by_channel) : [];
  const failures = data ? Object.entries(data.metrics.failures.by_reason) : [];

  return (
    <>
      <div className="topbar">
        <h1>Transaction Monitoring</h1>
        <button className="secondary" onClick={() => void load()}>
          Refresh
        </button>
      </div>
      {error ? <div className="card error">{error}</div> : null}
      {!data ? <div className="card">Loading dashboard...</div> : null}
      {today ? (
        <div className="grid kpi">
          <div className="card kpi-card">
            <h3>Total Transactions</h3>
            <p>{today.total_transactions}</p>
          </div>
          <div className="card kpi-card">
            <h3>Total Value</h3>
            <p>{money(today.total_value)}</p>
          </div>
          <div className="card kpi-card">
            <h3>Success Rate</h3>
            <p>{today.success_rate}%</p>
          </div>
          <div className="card kpi-card">
            <h3>Peak TPS</h3>
            <p>{today.peak_tps}</p>
          </div>
          <div className="card kpi-card">
            <h3>Pending</h3>
            <p>{today.pending_count}</p>
          </div>
        </div>
      ) : null}
      <div className="card">
        <h3>By Channel</h3>
        <table>
          <thead>
            <tr>
              <th>Channel</th>
              <th>Count</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {channels.map(([channel, metric]) => (
              <tr key={channel}>
                <td>{channel}</td>
                <td>{metric.count}</td>
                <td>{money(metric.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h3>Failure Reasons</h3>
        <table>
          <thead>
            <tr>
              <th>Reason</th>
              <th>Count</th>
            </tr>
          </thead>
          <tbody>
            {failures.map(([reason, count]) => (
              <tr key={reason}>
                <td>{reason}</td>
                <td>{count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

