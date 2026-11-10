'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setAccessToken } from './api';
import { UserSession, Permission, hasPermission } from './permissions';
import { useRouter } from 'next/navigation';

interface AuthContextType {
  user: UserSession | null;
  isLoading: boolean;
  can: (permission: Permission) => boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  // Restore session on mount via refresh cookie
  useEffect(() => {
    let isMounted = true;
    async function restoreSession() {
      try {
        const data = await api<{ accessToken: string; user: UserSession }>(
          '/auth/refresh',
          { method: 'POST' },
        );
        if (isMounted) {
          setAccessToken(data.accessToken);
          setUser(data.user);
        }
      } catch {
        if (isMounted) {
          setAccessToken(null);
          setUser(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    restoreSession();
    return () => {
      isMounted = false;
    };
  }, []);

  const can = useCallback(
    (permission: Permission): boolean => {
      return hasPermission(user?.roles, permission);
    },
    [user],
  );

  const login = async (email: string, password: string) => {
    const data = await api<{ accessToken: string; user: UserSession }>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      },
    );
    setAccessToken(data.accessToken);
    setUser(data.user);
    router.push('/dashboard');
  };

  const logout = async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      setAccessToken(null);
      setUser(null);
      router.push('/login');
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, can, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
