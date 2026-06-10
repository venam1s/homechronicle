import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import App from './App.jsx';
import { ToastProvider } from './components/Toast.jsx';
import AuthGate from './components/AuthGate.jsx';
import LoginPage from './components/LoginPage.jsx';
import SetupAdminPage from './components/SetupAdminPage.jsx';
import ResetPasswordPage from './components/ResetPasswordPage.jsx';
import { useUserCount } from './hooks/useAuth.js';
// react-grid-layout base styles must load before ./index.css so our themed
// overrides (placeholder, resize handle, drag state) take precedence.
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
    },
  },
});

// First-run routing wrapper: if no users exist (count===0) redirect to /setup;
// if users exist and on /setup, redirect to /login (D-04, AUTH-01).
function LoginOrSetup() {
  const { data, isLoading } = useUserCount();
  if (isLoading) return null;
  if (data?.count === 0) return <Navigate to="/setup" replace />;
  return <LoginPage />;
}

function SetupOrLogin() {
  const { data, isLoading } = useUserCount();
  if (isLoading) return null;
  if (data?.count > 0) return <Navigate to="/login" replace />;
  return <SetupAdminPage />;
}

const router = createBrowserRouter([
  { path: '/login', element: <LoginOrSetup /> },
  { path: '/setup', element: <SetupOrLogin /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  {
    path: '/*',
    element: (
      <AuthGate>
        <App />
      </AuthGate>
    ),
  },
]);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  </React.StrictMode>
);

if ('serviceWorker' in navigator) {
  const hostname = window.location.hostname;
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';

  if (import.meta.env.PROD && !isLocalhost) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}service-worker.js`).catch(() => {
        // Registration failures should not block app startup.
      });
    });
  } else {
    // Keep local Docker/native testing deterministic by removing stale PWA workers.
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        registration.unregister();
      });
    }).catch(() => {
      // Ignore cleanup failures.
    });
  }
}
