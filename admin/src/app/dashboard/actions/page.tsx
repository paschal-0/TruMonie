'use client';

import { FormEvent, useEffect, useState } from 'react';

import { apiGet, apiPost } from '@/lib/api';
import { getStoredToken } from '@/lib/auth';
import { ApiErrorShape } from '@/lib/types';

interface PendingAction {
  id: string;
  action_type: string;
  resource_type: string;
  resource_id: string;
  payload: Record<string, unknown>;
  maker_id: string;
  maker_reason: string;
  checker_id: string | null;
  checker_reason: string | null;
  status: string;
  expires_at: string;
  resolved_at: string | null;
  created_at: string;
}

interface ActionsResponse {
  items?: PendingAction[];
}

const presets = [
  'FREEZE_WALLET',
  'UNFREEZE_WALLET',
  'OVERRIDE_TRANSACTION_LIMIT',
  'MANUAL_CREDIT',
  'MANUAL_DEBIT',
  'AGENT_SUSPENSION',
  'SYSTEM_CONFIG_CHANGE',
  'USER_ROLE_ASSIGNMENT'
];

export default function MakerCheckerPage() {
  const [items, setItems] = useState<PendingAction[]>([]);
  const [status, setStatus] = useState('PENDING');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionType, setActionType] = useState(presets[0]);
  const [resourceType, setResourceType] = useState('WALLET');
  const [resourceId, setResourceId] = useState('');
  const [payloadJson, setPayloadJson] = useState('{"reason":"Fraud review"}');
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const load = async () => {
    const token = getStoredToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const query = status ? `?status=${encodeURIComponent(status)}` : '';
      const response = await apiGet<PendingAction[] | ActionsResponse>(`/admin/actions${query}`, token);
      if (Array.isArray(response)) {
        setItems(response);
      } else {
        setItems(response.items ?? []);
      }
    } catch (err) {
      const shaped = err as ApiErrorShape;
      setError(shaped.message || 'Failed to load pending actions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [status]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    const token = getStoredToken();
    if (!token) return;
    setNotice(null);
    setError(null);
    try {
      const parsedPayload = JSON.parse(payloadJson || '{}') as Record<string, unknown>;
      await apiPost(
        '/admin/actions',
        {
          action_type: actionType,
          resource_type: resourceType,
          resource_id: resourceId,
          payload: parsedPayload,
          reason
        },
        token
      );
      setNotice('Action submitted for approval.');
      setReason('');
      await load();
    } catch (err) {
      const shaped = err as ApiErrorShape;
      setError(shaped.message || 'Failed to create action');
    }
  };

  const resolveAction = async (id: string, action: 'approve' | 'reject') => {
    const token = getStoredToken();
    if (!token) return;
    const note = window.prompt(`Reason to ${action} this action`, '');
    if (!note) return;
    setError(null);
    setNotice(null);
    try {
      await apiPost(`/admin/actions/${id}/${action}`, { reason: note }, token);
      setNotice(`Action ${action}d`);
      await load();
    } catch (err) {
      const shaped = err as ApiErrorShape;
      setError(shaped.message || `Failed to ${action} action`);
    }
  };

  return (
    <>
      <div className="topbar">
        <h1>Maker Checker</h1>
        <div className="row-actions">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">ALL</option>
            <option value="PENDING">PENDING</option>
            <option value="APPROVED">APPROVED</option>
            <option value="REJECTED">REJECTED</option>
            <option value="EXPIRED">EXPIRED</option>
          </select>
          <button className="secondary" onClick={() => void load()}>
            Refresh
          </button>
        </div>
      </div>

      <form className="card" onSubmit={create}>
        <h3>Create Pending Action</h3>
        <div className="row-actions">
          <select value={actionType} onChange={(e) => setActionType(e.target.value)}>
            {presets.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <input
            placeholder="Resource Type"
            value={resourceType}
            onChange={(e) => setResourceType(e.target.value)}
            required
          />
          <input
            placeholder="Resource ID"
            value={resourceId}
            onChange={(e) => setResourceId(e.target.value)}
            required
          />
        </div>
        <div className="form-row">
          <label>Payload (JSON)</label>
          <textarea rows={5} value={payloadJson} onChange={(e) => setPayloadJson(e.target.value)} />
        </div>
        <div className="form-row">
          <label>Maker reason</label>
          <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} required />
        </div>
        <button type="submit">Submit Action</button>
      </form>

      {notice ? <div className="card success">{notice}</div> : null}
      {error ? <div className="card error">{error}</div> : null}
      {loading ? <div className="card">Loading actions...</div> : null}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Action</th>
              <th>Resource</th>
              <th>Status</th>
              <th>Maker</th>
              <th>Reason</th>
              <th>Created</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.action_type}</td>
                <td>
                  {item.resource_type}
                  <br />
                  <span className="muted small">{item.resource_id}</span>
                </td>
                <td>{item.status}</td>
                <td>{item.maker_id}</td>
                <td>{item.maker_reason}</td>
                <td>{new Date(item.created_at).toLocaleString()}</td>
                <td>
                  {item.status === 'PENDING' ? (
                    <div className="row-actions">
                      <button className="secondary" onClick={() => void resolveAction(item.id, 'approve')}>
                        Approve
                      </button>
                      <button className="danger" onClick={() => void resolveAction(item.id, 'reject')}>
                        Reject
                      </button>
                    </div>
                  ) : (
                    <span className="muted small">{item.checker_reason ?? '-'}</span>
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

