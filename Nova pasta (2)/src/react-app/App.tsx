import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { SupabaseAuthProvider, useSupabaseAuth } from "./auth/SupabaseAuthProvider";
import { Suspense, lazy } from "react";
import HomePage from "./pages/Home";
// REMOVIDO: A página de callback já não é necessária
// import AuthCallbackPage from "./pages/AuthCallback"; 
import ProtectedRoute from "./components/ProtectedRoute";
import LoadingSpinner from "./components/LoadingSpinner";

// Lazy load pages for better performance
const DashboardPage = lazy(() => import("./pages/Dashboard"));
const AppointmentsPage = lazy(() => import("./pages/Appointments"));
const FinancialPage = lazy(() => import("./pages/Financial"));
const ProductsPage = lazy(() => import("./pages/Products"));
const ClientsPage = lazy(() => import("./pages/Clients"));
const SettingsPage = lazy(() => import("./pages/Settings"));

function AppRoutes() {
  const { loading } = useSupabaseAuth();

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        {/* REMOVIDA: A rota para /auth/callback */}
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <Suspense fallback={<LoadingSpinner />}>
              <DashboardPage />
            </Suspense>
          </ProtectedRoute>
        } />
        <Route path="/appointments" element={
          <ProtectedRoute>
            <Suspense fallback={<LoadingSpinner />}>
              <AppointmentsPage />
            </Suspense>
          </ProtectedRoute>
        } />
        <Route path="/financial" element={
          <ProtectedRoute>
            <Suspense fallback={<LoadingSpinner />}>
              <FinancialPage />
            </Suspense>
          </ProtectedRoute>
        } />
        <Route path="/products" element={
          <ProtectedRoute>
            <Suspense fallback={<LoadingSpinner />}>
              <ProductsPage />
            </Suspense>
          </ProtectedRoute>
        } />
        <Route path="/clients" element={
          <ProtectedRoute>
            <Suspense fallback={<LoadingSpinner />}>
              <ClientsPage />
            </Suspense>
          </ProtectedRoute>
        } />
        <Route path="/settings" element={
          <ProtectedRoute>
            <Suspense fallback={<LoadingSpinner />}>
              <SettingsPage />
            </Suspense>
          </ProtectedRoute>
        } />
      </Routes>
    </Router>
  );
}

export default function App() {
  return (
    <SupabaseAuthProvider>
      <AppRoutes />
    </SupabaseAuthProvider>
  );
}

