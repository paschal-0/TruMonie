'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { apiPost } from '@/lib/api';
import { setStoredToken, setStoredUser } from '@/lib/auth';
import { ApiErrorShape, AdminUser } from '@/lib/types';

interface LoginResponse {
  user: AdminUser;
  tokens: {
    accessToken: string;
    refreshToken: string;
    tokenType: string;
  };
}

export default function LoginPage() {
  const router = useRouter();
  const [nextPath, setNextPath] = useState('/dashboard');

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
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
      const response = await apiPost<LoginResponse>('/auth/login', {
        identifier: identifier.trim(),
        password
      });
      if (!response?.user || response.user.role !== 'ADMIN') {
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
