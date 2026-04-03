'use client';

import { useEffect, useState } from 'react';

import { apiGet } from '@/lib/api';
import { getStoredToken } from '@/lib/auth';
import { ApiErrorShape } from '@/lib/types';

interface AnalyticsResponse {
  generated_at: string;
  transaction: {
    total_transactions: number;
    total_value_minor: number;
    success_rate: number;
    failures_total: number;
  };
  fraud: {
    active_alerts: number;
    pending_reviews: number;
    blocked_today: number;
  };
  agents: {
    total_agents: number;
    active_today: number;
    low_balance_agents: number;
  };
  maker_checker: {
    created_today: number;
    by_status: Record<string, number>;
  };
  compliance: {
    events_today: number;
    unresolved: number;
    by_risk_level: Record<string, number>;
  };
  regulatory: {
    submissions_today: number;
    accepted_returns: number;
    by_status: Record<string, number>;
  };
  audit: {
    logs_today: number;
    unique_actors_today: number;
  };
}

function money(amountMinor: number) {
  return `\u20A6${(amountMinor / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function mapRows(map: Record<string, number>) {
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

export default function ReportsPage() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const token = getStoredToken();
    if (!token) return;
    setError(null);
    try {
      const response = await apiGet<AnalyticsResponse>('/admin/dashboards/analytics', token);
      setData(response);
    } catch (err) {
      const shaped = err as ApiErrorShape;
      setError(shaped.message || 'Failed to load analytics report');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <>
      <div className="topbar">
        <h1>Reporting & Analytics</h1>
        <button className="secondary" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {error ? <div className="card error">{error}</div> : null}
      {!data ? <div className="card">Loading report snapshot...</div> : null}
      {data ? (
        <>
          <div className="card">
            <p className="muted small">Generated at: {new Date(data.generated_at).toLocaleString()}</p>
          </div>

          <div className="grid kpi">
            <div className="card kpi-card">
              <h3>Transactions Today</h3>
              <p>{data.transaction.total_transactions}</p>
            </div>
            <div className="card kpi-card">
              <h3>Txn Value</h3>
              <p>{money(data.transaction.total_value_minor)}</p>
            </div>
            <div className="card kpi-card">
              <h3>Txn Success</h3>
              <p>{data.transaction.success_rate}%</p>
            </div>
            <div className="card kpi-card">
              <h3>Fraud Alerts</h3>
              <p>{data.fraud.active_alerts}</p>
            </div>
            <div className="card kpi-card">
              <h3>Pending Reviews</h3>
              <p>{data.fraud.pending_reviews}</p>
            </div>
            <div className="card kpi-card">
              <h3>Audit Logs Today</h3>
              <p>{data.audit.logs_today}</p>
            </div>
          </div>

          <div className="grid kpi">
            <div className="card kpi-card">
              <h3>Agents (Total)</h3>
              <p>{data.agents.total_agents}</p>
            </div>
            <div className="card kpi-card">
              <h3>Agents Active Today</h3>
              <p>{data.agents.active_today}</p>
            </div>
            <div className="card kpi-card">
              <h3>Low Balance Agents</h3>
              <p>{data.agents.low_balance_agents}</p>
            </div>
            <div className="card kpi-card">
              <h3>Maker-Checker Created</h3>
              <p>{data.maker_checker.created_today}</p>
            </div>
            <div className="card kpi-card">
              <h3>Compliance Events</h3>
              <p>{data.compliance.events_today}</p>
            </div>
            <div className="card kpi-card">
              <h3>Reg Submissions</h3>
              <p>{data.regulatory.submissions_today}</p>
            </div>
          </div>

          <div className="card">
            <h3>Maker-Checker Status</h3>
            <table>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Count</th>
                </tr>
              </thead>
              <tbody>
                {mapRows(data.maker_checker.by_status).map(([status, count]) => (
                  <tr key={status}>
                    <td>{status}</td>
                    <td>{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h3>Compliance Risk Distribution</h3>
            <table>
              <thead>
                <tr>
                  <th>Risk Level</th>
                  <th>Count</th>
                </tr>
              </thead>
              <tbody>
                {mapRows(data.compliance.by_risk_level).map(([level, count]) => (
                  <tr key={level}>
                    <td>{level}</td>
                    <td>{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h3>Regulatory Submission Status</h3>
            <table>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Count</th>
                </tr>
              </thead>
              <tbody>
                {mapRows(data.regulatory.by_status).map(([status, count]) => (
                  <tr key={status}>
                    <td>{status}</td>
                    <td>{count}</td>
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

