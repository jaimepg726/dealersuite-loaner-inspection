import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ui/ProtectedRoute'
import ErrorBoundary from './components/ui/ErrorBoundary'
import LoadingScreen from './components/ui/LoadingScreen'

// Eagerly loaded (critical path)
import LoginPage                from './pages/LoginPage'
import PorterHome               from './pages/PorterHome'
import ScanVINPage              from './pages/ScanVINPage'
import SelectInspectionTypePage from './pages/SelectInspectionTypePage'
import InspectPage              from './pages/InspectPage'
import ManagerLayout            from './pages/ManagerLayout'
import InspectionsPage          from './pages/dashboard/InspectionsPage'
import LoanersPage              from './pages/dashboard/LoanersPage'
import FleetPage                from './pages/dashboard/FleetPage'

// Lazily loaded (heavy pages — Step 59)
const DamagePage   = lazy(() => import('./pages/dashboard/DamagePage'))
const ReportsPage  = lazy(() => import('./pages/dashboard/ReportsPage'))
const SettingsPage = lazy(() => import('./pages/dashboard/SettingsPage'))

function LazyPage({ children }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingScreen />}>
        {children}
      </Suspense>
    </ErrorBoundary>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>

        {/* ── Public ─────────────────────────────────────────────────── */}
        <Route path="/login" element={<LoginPage />} />

        {/* ── Porter routes (any authenticated user) ─────────────────── */}
        <Route path="/" element={
          <ProtectedRoute>
            <ErrorBoundary>
              <PorterHome />
            </ErrorBoundary>
          </ProtectedRoute>
        } />

        <Route path="/scan" element={
          <ProtectedRoute>
            <ErrorBoundary>
              <ScanVINPage />
            </ErrorBoundary>
          </ProtectedRoute>
        } />

        <Route path="/select-type" element={
          <ProtectedRoute>
            <ErrorBoundary>
              <SelectInspectionTypePage />
            </ErrorBoundary>
          </ProtectedRoute>
        } />

        <Route path="/inspect/:type/:vehicleId" element={
          <ProtectedRoute>
            <ErrorBoundary>
              <InspectPage />
            </ErrorBoundary>
          </ProtectedRoute>
        } />

        {/* ── Manager routes (role: manager | admin only) ─────────────── */}
        <Route path="/dashboard" element={
          <ProtectedRoute requireManager>
            <ManagerLayout />
          </ProtectedRoute>
        }>
          <Route index          element={<ErrorBoundary><InspectionsPage /></ErrorBoundary>} />
          <Route path="fleet"   element={<ErrorBoundary><FleetPage /></ErrorBoundary>} />
          <Route path="loaners" element={<ErrorBoundary><LoanersPage /></ErrorBoundary>} />
          <Route path="damage"   element={<LazyPage><DamagePage /></LazyPage>} />
          <Route path="reports"  element={<LazyPage><ReportsPage /></LazyPage>} />
          <Route path="settings" element={<LazyPage><SettingsPage /></LazyPage>} />
        </Route>

        {/* ── Catch-all ──────────────────────────────────────────────── */}
        <Route path="*" element={<Navigate to="/" replace />} />

      </Routes>
    </AuthProvider>
  )
}
