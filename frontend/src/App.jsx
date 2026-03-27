import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ui/ProtectedRoute'

// Pages
import LoginPage                from './pages/LoginPage'
import PorterHome               from './pages/PorterHome'
import ScanVINPage              from './pages/ScanVINPage'
import SelectInspectionTypePage from './pages/SelectInspectionTypePage'
import SelectUserPage           from './pages/SelectUserPage'
import ChangePinPage            from './pages/ChangePinPage'
import InspectPage              from './pages/InspectPage'
import ManagerLayout            from './pages/ManagerLayout'

// Dashboard sub-pages
import InspectionsPage  from './pages/dashboard/InspectionsPage'
import InspectionDetail from './pages/dashboard/InspectionDetail'
import FleetPage        from './pages/dashboard/FleetPage'
import DamagePage       from './pages/dashboard/DamagePage'
import ReportsPage      from './pages/dashboard/ReportsPage'
import SettingsPage      from './pages/dashboard/SettingsPage'
import InstructionsPage  from './pages/dashboard/InstructionsPage'
import LoanersPage       from './pages/dashboard/LoanersPage'

export default function App() {
  return (
    <AuthProvider>
      <Routes>

        {/* ── Public ─────────────────────────────────────────────────── */}
        <Route path="/login" element={<LoginPage />} />

        {/* ── Porter user selection (requires JWT, not manager-only) ─── */}
        <Route path="/select-user" element={
          <ProtectedRoute>
            <SelectUserPage />
          </ProtectedRoute>
        } />

        {/* ── PIN self-service (advisor / manager only) ────────────────── */}
        <Route path="/change-pin" element={
          <ProtectedRoute>
            <ChangePinPage />
          </ProtectedRoute>
        } />

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
          <Route index                          element={<InspectionsPage />} />
          <Route path="inspections/:id"         element={<InspectionDetail />} />
          <Route path="fleet"                   element={<FleetPage />} />
          <Route path="damage"                  element={<DamagePage />} />
          <Route path="loaners"                 element={<LoanersPage />} />
          <Route path="reports"                 element={<ReportsPage />} />
          <Route path="settings"                element={<SettingsPage />} />
          <Route path="instructions"            element={<InstructionsPage />} />
        </Route>

        {/* ── Catch-all ──────────────────────────────────────────────── */}
        <Route path="*" element={<Navigate to="/" replace />} />

      </Routes>
    </AuthProvider>
  )
}
