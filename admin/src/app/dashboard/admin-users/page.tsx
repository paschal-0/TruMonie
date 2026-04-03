'use client';

import { FormEvent, useEffect, useState } from 'react';

import { apiGet, apiPost } from '@/lib/api';
import { getStoredToken } from '@/lib/auth';
import { ApiErrorShape } from '@/lib/types';

interface AdminUserRow {
  id: string;
  user_id: string;
  email: string;
  name: string;
  role: string;
  department: string | null;
  is_active: boolean;
  mfa_enabled: boolean;
  last_login_at: string | null;
  created_at: string;
}

const roles = [
  'SUPER_ADMIN',
  'ADMIN',
  'COMPLIANCE_OFFICER',
  'OPERATIONS_MANAGER',
  'FINANCE_OFFICER',
  'CUSTOMER_SUPPORT',
  'AUDITOR'
];

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [targetUserId, setTargetUserId] = useState('');
  const [role, setRole] = useState(roles[1]);
  const [department, setDepartment] = useState('');
  const [reason, setReason] = useState('');

  const load = async () => {
    const token = getStoredToken();
    if (!token) return;
    setError(null);
    try {
      setUsers(await apiGet<AdminUserRow[]>('/admin/users', token));
    } catch (err) {
      const shaped = err as ApiErrorShape;
      setError(shaped.message || 'Failed to load admin users');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const token = getStoredToken();
    if (!token) return;
    setError(null);
    setNotice(null);
    try {
      await apiPost(
        `/admin/users/${targetUserId}/role`,
        {
          role,
          department: department || undefined,
          reason
        },
        token
      );
      setNotice('Role assignment submitted for approval');
      setTargetUserId('');
      setDepartment('');
      setReason('');
    } catch (err) {
      const shaped = err as ApiErrorShape;
      setError(shaped.message || 'Failed to submit role assignment');
    }
  };

  const toggleStatus = async (userId: string, nextStatus: boolean) => {
    const token = getStoredToken();
    if (!token) return;
    setError(null);
    setNotice(null);
    try {
      await apiPost(`/admin/users/${userId}/status`, { is_active: nextStatus }, token);
      setNotice(`Admin ${nextStatus ? 'activated' : 'deactivated'}`);
      await load();
    } catch (err) {
      const shaped = err as ApiErrorShape;
      setError(shaped.message || 'Failed to update admin status');
    }
  };

  const toggleMfa = async (userId: string, enabled: boolean) => {
    const token = getStoredToken();
    if (!token) return;
    setError(null);
    setNotice(null);
    try {
      await apiPost(`/admin/users/${userId}/mfa`, { mfa_enabled: enabled }, token);
      setNotice(`MFA ${enabled ? 'enabled' : 'disabled'} for admin`);
      await load();
    } catch (err) {
      const shaped = err as ApiErrorShape;
      setError(shaped.message || 'Failed to update MFA setting');
    }
  };

  const revokeSessions = async (userId: string) => {
    const token = getStoredToken();
    if (!token) return;
    setError(null);
    setNotice(null);
    try {
      await apiPost(`/admin/users/${userId}/revoke-sessions`, {}, token);
      setNotice('Sessions revoked');
    } catch (err) {
      const shaped = err as ApiErrorShape;
      setError(shaped.message || 'Failed to revoke sessions');
    }
  };

  return (
    <>
      <div className="topbar">
        <h1>Admin Users</h1>
        <button className="secondary" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      <form className="card" onSubmit={submit}>
        <h3>Assign Role (Maker-Checker)</h3>
        <div className="row-actions">
          <input
            placeholder="Target User ID"
            value={targetUserId}
            onChange={(e) => setTargetUserId(e.target.value)}
            required
          />
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {roles.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <input
            placeholder="Department (optional)"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          />
        </div>
        <div className="form-row">
          <label>Reason</label>
          <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} required />
        </div>
        <button type="submit">Submit</button>
      </form>

      {notice ? <div className="card success">{notice}</div> : null}
      {error ? <div className="card error">{error}</div> : null}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Department</th>
              <th>MFA</th>
              <th>Active</th>
              <th>Last Login</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.name}</td>
                <td>{user.email}</td>
                <td>{user.role}</td>
                <td>{user.department ?? '-'}</td>
                <td>{user.mfa_enabled ? 'YES' : 'NO'}</td>
                <td>{user.is_active ? 'YES' : 'NO'}</td>
                <td>{user.last_login_at ? new Date(user.last_login_at).toLocaleString() : '-'}</td>
                <td>
                  <div className="row-actions">
                    <button
                      className="secondary"
                      onClick={() => void toggleStatus(user.user_id, !user.is_active)}
                    >
                      {user.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      className="secondary"
                      onClick={() => void toggleMfa(user.user_id, !user.mfa_enabled)}
                    >
                      {user.mfa_enabled ? 'Disable MFA' : 'Enable MFA'}
                    </button>
                    <button className="danger" onClick={() => void revokeSessions(user.user_id)}>
                      Revoke Sessions
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
