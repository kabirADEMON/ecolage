import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Outlet, RouterProvider, ScrollRestoration } from 'react-router';
import { AppShell } from './components/AppShell';
import { ToastProvider } from './components/Toast';
import { ApiError } from './lib/api';
import { RequireSession } from './lib/session';
import { Login, Register } from './pages/Auth';
import { Cash, ReceiptPage } from './pages/Cash';
import { Classes } from './pages/Classes';
import { Dashboard } from './pages/Dashboard';
import { Landing } from './pages/Landing';
import { NotFound, ParentPortal, PaymentReturn, PaymentSimulation, PortalReceipt } from './pages/Public';
import { Settings } from './pages/Settings';
import { StudentPage } from './pages/StudentPage';
import { ImportStudents, Students } from './pages/Students';
import { Team } from './pages/Team';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: (count, err) => (!(err instanceof ApiError) || err.status === 0 || err.status >= 500) && count < 2,
    },
  },
});

function Root() {
  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  );
}

const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: '/', element: <Landing /> },
      { path: '/connexion', element: <Login /> },
      { path: '/inscription', element: <Register /> },
      { path: '/p/:token', element: <ParentPortal /> },
      { path: '/p/:token/recus/:id', element: <PortalReceipt /> },
      { path: '/paiement/simulation/:id', element: <PaymentSimulation /> },
      { path: '/paiement/:id', element: <PaymentReturn /> },
      {
        path: '/app',
        element: <RequireSession>{(session) => <AppShell session={session} />}</RequireSession>,
        children: [
          { index: true, element: <Dashboard /> },
          { path: 'eleves', element: <Students /> },
          { path: 'eleves/importer', element: <ImportStudents /> },
          { path: 'eleves/:id', element: <StudentPage /> },
          { path: 'recus/:id', element: <ReceiptPage /> },
          { path: 'caisse', element: <Cash /> },
          { path: 'classes', element: <Classes /> },
          { path: 'equipe', element: <Team /> },
          { path: 'reglages', element: <Settings /> },
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
