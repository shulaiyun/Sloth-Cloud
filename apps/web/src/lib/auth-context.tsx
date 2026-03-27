import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { requestJson } from './api';
import type { AuthResponse, AuthUser, LoginInput, LogoutResponse, MeResponse, RegisterInput } from './types';

const TOKEN_STORAGE_KEY = 'sloth-cloud-access-token';

interface AuthContextValue {
  isAuthenticated: boolean;
  loading: boolean;
  token: string | null;
  user: AuthUser | null;
  login: (payload: LoginInput) => Promise<AuthResponse>;
  logout: () => Promise<void>;
  register: (payload: RegisterInput) => Promise<AuthResponse>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => window.localStorage.getItem(TOKEN_STORAGE_KEY));
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(window.localStorage.getItem(TOKEN_STORAGE_KEY)));

  useEffect(() => {
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    requestJson<MeResponse>('/api/v1/auth/me', {
      token,
    })
      .then((response) => {
        setUser(response.data.user);
      })
      .catch(() => {
        window.localStorage.removeItem(TOKEN_STORAGE_KEY);
        setToken(null);
        setUser(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [token]);

  const value = useMemo<AuthContextValue>(() => ({
    isAuthenticated: Boolean(token && user),
    loading,
    token,
    user,
    async login(payload) {
      const response = await requestJson<AuthResponse>('/api/v1/auth/login', {
        method: 'POST',
        body: payload,
      });

      window.localStorage.setItem(TOKEN_STORAGE_KEY, response.data.accessToken);
      setToken(response.data.accessToken);
      setUser(response.data.user);

      return response;
    },
    async register(payload) {
      const response = await requestJson<AuthResponse>('/api/v1/auth/register', {
        method: 'POST',
        body: payload,
      });

      window.localStorage.setItem(TOKEN_STORAGE_KEY, response.data.accessToken);
      setToken(response.data.accessToken);
      setUser(response.data.user);

      return response;
    },
    async logout() {
      if (token) {
        await requestJson<LogoutResponse>('/api/v1/auth/logout', {
          method: 'POST',
          token,
        }).catch(() => undefined);
      }

      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      setToken(null);
      setUser(null);
    },
  }), [loading, token, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }

  return context;
}
