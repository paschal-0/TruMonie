import AsyncStorage from 'expo-secure-store';
import React, { createContext, useContext, useEffect, useState } from 'react';

interface Session {
  accessToken: string;
  refreshToken: string;
}

interface AuthContextValue {
  session: Session | null;
  hydrating: boolean;
  login: (tokens: Session) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const DEV_BYPASS_AUTH =  true; // set to false to restore real token flow

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(DEV_BYPASS_AUTH ? { accessToken: 'dev', refreshToken: 'dev' } : null);
  const [hydrating, setHydrating] = useState(DEV_BYPASS_AUTH ? false : true);

  useEffect(() => {
    if (DEV_BYPASS_AUTH) return;
    const load = async () => {
      const accessToken = await AsyncStorage.getItemAsync('accessToken');
      const refreshToken = await AsyncStorage.getItemAsync('refreshToken');
      if (accessToken && refreshToken) {
        setSession({ accessToken, refreshToken });
      }
      setHydrating(false);
    };
    void load();
  }, []);

  const login = async (tokens: Session) => {
    setSession(tokens);
    await AsyncStorage.setItemAsync('accessToken', tokens.accessToken);
    await AsyncStorage.setItemAsync('refreshToken', tokens.refreshToken);
  };

  const logout = async () => {
    setSession(null);
    await AsyncStorage.deleteItemAsync('accessToken');
    await AsyncStorage.deleteItemAsync('refreshToken');
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
