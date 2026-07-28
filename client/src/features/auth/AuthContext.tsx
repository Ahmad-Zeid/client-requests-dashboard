import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { apiRequest, tokenStorage } from '../../lib/apiClient';
import type { SessionUser } from '../../types/request';

type AuthStatus = 'checking' | 'authenticated' | 'anonymous';

type AuthContextValue = {
  status: AuthStatus;
  user: SessionUser | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('checking');
  const [user, setUser] = useState<SessionUser | null>(null);

  /**
   * A token in localStorage is a claim, not proof — it may have expired while the
   * tab was closed. On boot we ask the server who we are and only then render the
   * app as signed in. The `checking` status exists so the UI does not flash the
   * login screen at a user who is in fact still authenticated.
   */
  useEffect(() => {
    if (!tokenStorage.get()) {
      setStatus('anonymous');
      return;
    }

    let cancelled = false;

    apiRequest<{ data: { user: SessionUser } }>('/auth/me')
      .then((response) => {
        if (cancelled) return;
        setUser(response.data.user);
        setStatus('authenticated');
      })
      .catch(() => {
        if (cancelled) return;
        // apiRequest already cleared the token on a 401.
        setUser(null);
        setStatus('anonymous');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const response = await apiRequest<{ data: { token: string; user: SessionUser } }>(
      '/auth/login',
      { method: 'POST', body: { email, password } },
    );

    tokenStorage.set(response.data.token);
    setUser(response.data.user);
    setStatus('authenticated');
  }, []);

  const signOut = useCallback(() => {
    tokenStorage.clear();
    setUser(null);
    setStatus('anonymous');
  }, []);

  const value = useMemo(
    () => ({ status, user, signIn, signOut }),
    [status, user, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside an AuthProvider.');
  }
  return context;
}
