import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ui/ProtectedRoute'

// Pages
import LoginPage                from './pages/LoginPage'
import PorterHome               from './pages/PorterHome'
import ScanVINPage              from './pages/ScanVINPage'
import SelectInspectionTypePage from './pages/SelectInspectionTypePage'
import InspectPage              from './pages/InspectPage'
import ManagerLayout            from './pages/ManagerLayout'

// Dashboard sub-pages
import InspectionsPage  from './pages/dashboard/InspectionsPage'
import FleetPage        from './pages/dashboard/FleetPage'
import DamagePage       from './pages/dashboard/DamagePage'
import ReportsPage      from './pages/dashboard/ReportsPage'
import SettingsPage     from './pages/dashboard/SettingsPage'

export default function App() {
  return (
    <AuthProvider>
      <Routes>

        {/* ── Public ─────────────────────────────────────────────────── */}
        <Route path="/login" element={<LoginPage />} />

        {/* ── Porter routes (any authenticated user) ─────────────────── */}
        <Route path="/" element={
          <ProtectedRoute>
            <PorterHome />
          </ProtectedRoute>
        } />

        <Route path="/scan" element={
          <ProtectedRoute>
            <ScanVINPage />
          </ProtectedRoute>
        } />

        <Route path="/select-type" element={
          <ProtectedRoute>
            <SelectInspectionTypePage />
          </ProtectedRoute>
        } />

        <Route path="/inspect/:type/:vehicleId" element={
          <ProtectedRoute>
            <InspectPage />
          </ProtectedRoute>
        } />

        {/* ── Manager routes (role: manager | admin only) ─────────────── */}
        <Route path="/dashboard" element={
          <ProtectedRoute requireManager>
            <ManagerLayout />
          </ProtectedRoute>
        }>
          {/* Default dashboard tab = Inspections */}
          <Route index          element={<InspectionsPage />} />
          <Route path="fleet"   element={<FleetPage />} />
          <Route path="damage"  element={<DamagePage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>

        {/* ── Catch-all ──────────────────────────────────────────────── */}
        <Route path="*" element={<Navigate to="/" replace />} />

      </Routes>
    </AuthProvider>
  )
}
