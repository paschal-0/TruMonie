'use client';

import { useEffect, useState } from 'react';

import { apiGet } from '@/lib/api';
import { getStoredToken } from '@/lib/auth';
import { ApiErrorShape } from '@/lib/types';

interface FraudDashboardResponse {
  risk_overview: {
    active_alerts: number;
    pending_reviews: number;
    blocked_transactions_today: number;
    total_blocked_value: number;
    false_positive_rate: number;
  };
  recent_alerts: Array<{
    alert_id: string;
    user_id: string;
    risk_score: number;
    reason: string;
    status: string;
    created_at: string;
  }>;
  model_performance: {
    precision: number;
    recall: number;
    f1_score: number;
    model_version: string;
  };
}

export default function FraudControlPage() {
  const [data, setData] = useState<FraudDashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const token = getStoredToken();
    if (!token) return;
    setError(null);
    try {
      setData(await apiGet<FraudDashboardResponse>('/admin/dashboards/fraud', token));
    } catch (err) {
      const shaped = err as ApiErrorShape;
      setError(shaped.message || 'Failed to load fraud control metrics');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <>
      <div className="topbar">
        <h1>Fraud Control</h1>
        <button className="secondary" onClick={() => void load()}>
          Refresh
        </button>
      </div>
      {error ? <div className="card error">{error}</div> : null}
      {!data ? <div className="card">Loading fraud dashboard...</div> : null}
      {data ? (
        <>
          <div className="grid kpi">
            <div className="card kpi-card">
              <h3>Active Alerts</h3>
              <p>{data.risk_overview.active_alerts}</p>
            </div>
            <div className="card kpi-card">
              <h3>Pending Reviews</h3>
              <p>{data.risk_overview.pending_reviews}</p>
            </div>
            <div className="card kpi-card">
              <h3>Blocked Today</h3>
              <p>{data.risk_overview.blocked_transactions_today}</p>
            </div>
            <div className="card kpi-card">
              <h3>False Positive Rate</h3>
              <p>{data.risk_overview.false_positive_rate}%</p>
            </div>
          </div>
          <div className="card">
            <h3>Recent Alerts</h3>
            <table>
              <thead>
                <tr>
                  <th>Alert ID</th>
                  <th>User ID</th>
                  <th>Risk Score</th>
                  <th>Status</th>
                  <th>Reason</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_alerts.map((alert) => (
                  <tr key={alert.alert_id}>
                    <td>{alert.alert_id}</td>
                    <td>{alert.user_id}</td>
                    <td>{alert.risk_score}</td>
                    <td>{alert.status}</td>
                    <td>{alert.reason}</td>
                    <td>{new Date(alert.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card">
            <h3>Model Performance</h3>
            <p className="muted">
              Precision: {data.model_performance.precision} | Recall: {data.model_performance.recall} |
              F1: {data.model_performance.f1_score} | Version: {data.model_performance.model_version}
            </p>
          </div>
        </>
      ) : null}
    </>
  );
}

