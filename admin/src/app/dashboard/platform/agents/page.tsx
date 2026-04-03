'use client';

import { useEffect, useState } from 'react';

import { apiGet } from '@/lib/api';
import { getStoredToken } from '@/lib/auth';
import { ApiErrorShape } from '@/lib/types';

interface AgentPerformanceResponse {
  summary: {
    total_agents: number;
    active_today: number;
    suspended: number;
    low_balance_agents: number;
    total_daily_volume: number;
  };
  top_agents: Array<{
    agent_code: string;
    name: string;
    txn_count: number;
    volume: number;
    score: number;
  }>;
  bottom_agents: Array<{
    agent_code: string;
    name: string;
    txn_count: number;
    volume: number;
    score: number;
  }>;
}

function money(amountMinor: number) {
  return `\u20A6${(amountMinor / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

export default function AgentPerformancePage() {
  const [data, setData] = useState<AgentPerformanceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const token = getStoredToken();
    if (!token) return;
    setError(null);
    try {
      setData(await apiGet<AgentPerformanceResponse>('/admin/dashboards/agents', token));
    } catch (err) {
      const shaped = err as ApiErrorShape;
      setError(shaped.message || 'Failed to load agent performance');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <>
      <div className="topbar">
        <h1>Agent Performance</h1>
        <button className="secondary" onClick={() => void load()}>
          Refresh
        </button>
      </div>
      {error ? <div className="card error">{error}</div> : null}
      {!data ? <div className="card">Loading agent metrics...</div> : null}
      {data ? (
        <>
          <div className="grid kpi">
            <div className="card kpi-card">
              <h3>Total Agents</h3>
              <p>{data.summary.total_agents}</p>
            </div>
            <div className="card kpi-card">
              <h3>Active Today</h3>
              <p>{data.summary.active_today}</p>
            </div>
            <div className="card kpi-card">
              <h3>Suspended</h3>
              <p>{data.summary.suspended}</p>
            </div>
            <div className="card kpi-card">
              <h3>Low Balance Agents</h3>
              <p>{data.summary.low_balance_agents}</p>
            </div>
            <div className="card kpi-card">
              <h3>Total Daily Volume</h3>
              <p>{money(data.summary.total_daily_volume)}</p>
            </div>
          </div>
          <div className="card">
            <h3>Top Agents</h3>
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Txn Count</th>
                  <th>Volume</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {data.top_agents.map((agent) => (
                  <tr key={agent.agent_code}>
                    <td>{agent.agent_code}</td>
                    <td>{agent.name}</td>
                    <td>{agent.txn_count}</td>
                    <td>{money(agent.volume)}</td>
                    <td>{agent.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card">
            <h3>Bottom Agents</h3>
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Txn Count</th>
                  <th>Volume</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {data.bottom_agents.map((agent) => (
                  <tr key={agent.agent_code}>
                    <td>{agent.agent_code}</td>
                    <td>{agent.name}</td>
                    <td>{agent.txn_count}</td>
                    <td>{money(agent.volume)}</td>
                    <td>{agent.score}</td>
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

