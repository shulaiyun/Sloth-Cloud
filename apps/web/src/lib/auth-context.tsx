import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { requestJson } from './api';
import type { AuthResponse, AuthUser, LoginInput, LogoutResponse, MeResponse, RegisterInput } from './types';

interface AuthContextValue {
  isAuthenticated: boolean;
  loading: boolean;
  user: AuthUser | null;
  login: (payload: LoginInput) => Promise<AuthResponse>;
  logout: () => Promise<void>;
  register: (payload: RegisterInput) => Promise<AuthResponse>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const response = await requestJson<MeResponse>('/api/v1/auth/me');
      setUser(response.data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    isAuthenticated: Boolean(user),
    loading,
    user,
    async login(payload) {
      const response = await requestJson<AuthResponse>('/api/v1/auth/login', {
        method: 'POST',
        body: payload,
      });
      setUser(response.data.user);

      return response;
    },
    async register(payload) {
      const response = await requestJson<AuthResponse>('/api/v1/auth/register', {
        method: 'POST',
        body: payload,
      });
      setUser(response.data.user);

      return response;
    },
    async logout() {
      await requestJson<LogoutResponse>('/api/v1/auth/logout', {
        method: 'POST',
      }).catch(() => undefined);

      setUser(null);
    },
    refresh,
  }), [loading, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }

  return context;
}
