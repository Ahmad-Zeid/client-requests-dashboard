import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

import { useAuth } from './AuthContext';

/**
 * Gate in front of every authenticated route.
 *
 * This is a convenience, not a security control — the real boundary is the
 * server's `requireAuth` middleware. Hiding a route in the client only stops an
 * honest user from seeing a screen that would fail anyway.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'checking') {
    // Deliberately blank: the check is a single fast request, and a spinner that
    // flashes for 80ms is worse than nothing.
    return null;
  }

  if (status === 'anonymous') {
    // Remember where they were headed so sign-in can return them there.
    return <Navigate to="/sign-in" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}
