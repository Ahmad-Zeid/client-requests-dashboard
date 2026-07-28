import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/ToastProvider';
import { AuthProvider } from './features/auth/AuthContext';
import { ProtectedRoute } from './features/auth/ProtectedRoute';
import { SignInPage } from './features/auth/SignInPage';
import { RequestsPage } from './features/requests/RequestsPage';
import { ApiClientError } from './lib/apiClient';

/**
 * One client for the app. Defaults live here so individual hooks only override
 * what is genuinely different about them.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Refetch when the tab regains focus: the cheapest correct answer to
      // "someone changed this while I was in another window".
      refetchOnWindowFocus: true,
      retry: (failureCount, error) => {
        if (error instanceof ApiClientError && error.status < 500) return false;
        return failureCount < 2;
      },
    },
    mutations: {
      // Mutations are not idempotent here — a retried POST is a duplicate row.
      retry: false,
    },
  },
});

export function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ToastProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/sign-in" element={<SignInPage />} />
                <Route
                  path="/requests"
                  element={
                    <ProtectedRoute>
                      <RequestsPage />
                    </ProtectedRoute>
                  }
                />
                <Route path="*" element={<Navigate to="/requests" replace />} />
              </Routes>
            </BrowserRouter>
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
