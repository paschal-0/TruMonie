'use client';

import { FormEvent, useEffect, useState } from 'react';

import { apiGet, apiPost } from '@/lib/api';
import { getStoredToken } from '@/lib/auth';
import { ApiErrorShape } from '@/lib/types';

interface ConfigRow {
  id: string;
  config_key: string;
  config_value: Record<string, unknown>;
  description: string | null;
  changed_by: string;
  approved_by: string | null;
  version: number;
  is_active: boolean;
  created_at: string;
}

export default function SystemConfigPage() {
  const [items, setItems] = useState<ConfigRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [configKey, setConfigKey] = useState('');
  const [configValue, setConfigValue] = useState('{}');
  const [description, setDescription] = useState('');

  const load = async () => {
    const token = getStoredToken();
    if (!token) return;
    setError(null);
    try {
      setItems(await apiGet<ConfigRow[]>('/admin/system-config', token));
    } catch (err) {
      const shaped = err as ApiErrorShape;
      setError(shaped.message || 'Failed to load system configs');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const createDraft = async (event: FormEvent) => {
    event.preventDefault();
    const token = getStoredToken();
    if (!token) return;
    setError(null);
    setNotice(null);
    try {
      await apiPost(
        '/admin/system-config',
        {
          config_key: configKey,
          config_value: JSON.parse(configValue),
          description: description || undefined
        },
        token
      );
      setNotice('Config draft created');
      setConfigValue('{}');
      setDescription('');
      await load();
    } catch (err) {
      const shaped = err as ApiErrorShape;
      setError(shaped.message || 'Failed to create config draft');
    }
  };

  const activate = async (id: string) => {
    const token = getStoredToken();
    if (!token) return;
    setError(null);
    setNotice(null);
    try {
      await apiPost(`/admin/system-config/${id}/activate`, {}, token);
      setNotice('Config version activated');
      await load();
    } catch (err) {
      const shaped = err as ApiErrorShape;
      setError(shaped.message || 'Failed to activate config');
    }
  };

  const rollback = async (configKey: string) => {
    const token = getStoredToken();
    if (!token) return;
    setError(null);
    setNotice(null);
    try {
      await apiPost(`/admin/system-config/${encodeURIComponent(configKey)}/rollback`, {}, token);
      setNotice(`Rolled back ${configKey} to previous active version`);
      await load();
    } catch (err) {
      const shaped = err as ApiErrorShape;
      setError(shaped.message || 'Failed to rollback config');
    }
  };

  return (
    <>
      <div className="topbar">
        <h1>System Configuration</h1>
        <button className="secondary" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      <form className="card" onSubmit={createDraft}>
        <h3>Create Config Draft</h3>
        <div className="row-actions">
          <input
            placeholder="Config key e.g. tier_1_daily_limit"
            value={configKey}
            onChange={(e) => setConfigKey(e.target.value)}
            required
          />
          <input
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="form-row">
          <label>Config Value JSON</label>
          <textarea rows={5} value={configValue} onChange={(e) => setConfigValue(e.target.value)} />
        </div>
        <button type="submit">Create Draft</button>
      </form>

      {notice ? <div className="card success">{notice}</div> : null}
      {error ? <div className="card error">{error}</div> : null}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Key</th>
              <th>Version</th>
              <th>Active</th>
              <th>Changed By</th>
              <th>Approved By</th>
              <th>Created</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  {item.config_key}
                  <br />
                  <span className="muted small">{JSON.stringify(item.config_value)}</span>
                </td>
                <td>{item.version}</td>
                <td>{item.is_active ? 'YES' : 'NO'}</td>
                <td>{item.changed_by}</td>
                <td>{item.approved_by ?? '-'}</td>
                <td>{new Date(item.created_at).toLocaleString()}</td>
                <td>
                  <div className="row-actions">
                    {!item.is_active ? (
                      <button className="secondary" onClick={() => void activate(item.id)}>
                        Activate
                      </button>
                    ) : (
                      <span className="muted small">Active</span>
                    )}
                    <button className="secondary" onClick={() => void rollback(item.config_key)}>
                      Rollback
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
