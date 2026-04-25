import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { requestJson } from './api';
import type {
  AuthResponse,
  AuthUser,
  LoginInput,
  LogoutResponse,
  MeResponse,
  RegisterInput,
} from './types';

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (input: LoginInput) => Promise<AuthUser>;
  register: (input: RegisterInput) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<AuthUser | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const response = await requestJson<MeResponse>('/api/v1/auth/me');
      const nextUser = response?.data?.user ?? null;
      setUser(nextUser);
      return nextUser;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (input: LoginInput) => {
    const response = await requestJson<AuthResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: input,
    });
    const nextUser = response.data.user;
    setUser(nextUser);
    setLoading(false);
    return nextUser;
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const response = await requestJson<AuthResponse>('/api/v1/auth/register', {
      method: 'POST',
      body: input,
    });
    const nextUser = response.data.user;
    setUser(nextUser);
    setLoading(false);
    return nextUser;
  }, []);

  const logout = useCallback(async () => {
    try {
      await requestJson<LogoutResponse>('/api/v1/auth/logout', {
        method: 'POST',
      });
    } finally {
      setUser(null);
      setLoading(false);
    }
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    isAuthenticated: Boolean(user),
    loading,
    login,
    register,
    logout,
    refresh,
  }), [loading, login, logout, refresh, register, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
