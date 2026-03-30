import * as SecureStore from 'expo-secure-store';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiPost } from '../api/client';

interface Session {
  accessToken: string;
  refreshToken: string;
}

interface AuthResponse {
  tokens: Session;
}

interface AuthContextValue {
  session: Session | null;
  hydrating: boolean;
  login: (tokens: Session) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const TOKEN_REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const authBypassEnv = process.env.EXPO_PUBLIC_AUTH_BYPASS;
const AUTH_BYPASS_ENABLED =
  authBypassEnv === undefined
    ? __DEV__
    : authBypassEnv === '1' || authBypassEnv.toLowerCase() === 'true';
const BYPASS_SESSION: Session = {
  accessToken: '',
  refreshToken: ''
};

async function persistSession(tokens: Session) {
  await SecureStore.setItemAsync('accessToken', tokens.accessToken);
  await SecureStore.setItemAsync('refreshToken', tokens.refreshToken);
}

async function clearSession() {
  await SecureStore.deleteItemAsync('accessToken');
  await SecureStore.deleteItemAsync('refreshToken');
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [hydrating, setHydrating] = useState(true);

  const refreshWithToken = useCallback(async (refreshToken: string) => {
    const refreshed = await apiPost<AuthResponse>('/auth/refresh', { refreshToken });
    const tokens = refreshed.tokens;
    setSession(tokens);
    await persistSession(tokens);
    return tokens;
  }, []);

  useEffect(() => {
    const load = async () => {
      if (AUTH_BYPASS_ENABLED) {
        setSession(BYPASS_SESSION);
        setHydrating(false);
        return;
      }

      const accessToken = await SecureStore.getItemAsync('accessToken');
      const refreshToken = await SecureStore.getItemAsync('refreshToken');
      if (!accessToken || !refreshToken) {
        setSession(null);
        setHydrating(false);
        return;
      }

      try {
        await refreshWithToken(refreshToken);
      } catch {
        setSession(null);
        await clearSession();
      }
      setHydrating(false);
    };
    void load();
  }, [refreshWithToken]);

  useEffect(() => {
    if (AUTH_BYPASS_ENABLED) return;
    if (!session?.refreshToken) return;

    const interval = setInterval(() => {
      void refreshWithToken(session.refreshToken).catch(async () => {
        setSession(null);
        await clearSession();
      });
    }, TOKEN_REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [refreshWithToken, session?.refreshToken]);

  const login = async (tokens: Session) => {
    setSession(tokens);
    await persistSession(tokens);
  };

  const logout = async () => {
    if (AUTH_BYPASS_ENABLED) {
      setSession(BYPASS_SESSION);
      await clearSession();
      return;
    }

    setSession(null);
    await clearSession();
  };

  return (
    <AuthContext.Provider value={{ session, hydrating, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
};
