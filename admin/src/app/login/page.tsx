'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { apiPost } from '@/lib/api';
import { isAdminRole, setStoredToken, setStoredUser } from '@/lib/auth';
import { ApiErrorShape, AdminUser } from '@/lib/types';

interface LoginResponse {
  user: AdminUser;
  tokens: {
    accessToken: string;
    refreshToken: string;
    tokenType: string;
  };
  mfa_required?: boolean;
  destination?: string;
  message?: string;
}

export default function LoginPage() {
  const router = useRouter();
  const [nextPath, setNextPath] = useState('/dashboard');

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaDestination, setMfaDestination] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    setNextPath(params.get('next') || '/dashboard');
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await apiPost<LoginResponse>('/auth/admin/login', {
        identifier: identifier.trim(),
        password,
        ...(mfaCode ? { mfa_code: mfaCode } : {})
      });
      if (response?.mfa_required) {
        setMfaRequired(true);
        setMfaDestination(response.destination ?? null);
        setLoading(false);
        return;
      }
      if (!response?.user || !isAdminRole(response.user.role)) {
        setError('This account is not an admin account.');
        setLoading(false);
        return;
      }
      setStoredToken(response.tokens.accessToken);
      setStoredUser(response.user);
      router.replace(nextPath);
    } catch (err) {
      const shaped = err as ApiErrorShape;
      setError(shaped.message || 'Login failed');
      setLoading(false);
    }
  };

  return (
    <main className="auth-shell">
      <form className="card auth-card" onSubmit={submit}>
        <h1>Admin Login</h1>
        <p className="muted">Sign in with an admin account to access controls.</p>

        <div className="form-row">
          <label>Identifier (email/phone)</label>
          <input
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="admin@example.com"
            required
          />
        </div>

        <div className="form-row">
          <label>Password</label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder="********"
            required
          />
        </div>

        {mfaRequired ? (
          <div className="form-row">
            <label>MFA Code {mfaDestination ? `(sent to ${mfaDestination})` : ''}</label>
            <input
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              type="text"
              inputMode="numeric"
              placeholder="6-digit code"
              required
            />
          </div>
        ) : null}

        {error ? <p className="error">{error}</p> : null}

        <div className="form-row">
          <button type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </div>
      </form>
    </main>
  );
}
