import { Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ui/ProtectedRoute'
import api from './utils/api'

function DemoBanner() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const check = () =>
      api.get('/api/admin/demo/status')
        .then(({ data }) => setShow(data.demo_mode))
        .catch(() => {})

    check()
    window.addEventListener('demo-mode-changed', check)
    return () => window.removeEventListener('demo-mode-changed', check)
  }, [])

  if (!show) return null
  return (
    <div className="sticky top-0 z-50 w-full bg-yellow-400 text-black text-center text-sm font-bold py-2 px-4">
      ⚠ DEMO MODE ACTIVE — DATA IS SIMULATED
    </div>
  )
}

// Pages
import LoginPage                from './pages/LoginPage'
import PorterHome               from './pages/PorterHome'
import ScanVINPage              from './pages/ScanVINPage'
import SelectInspectionTypePage from './pages/SelectInspectionTypePage'
import InspectPage              from './pages/InspectPage'
import ManagerLayout            from './pages/ManagerLayout'

// Dashboard sub-pages
import InspectionsPage        from './pages/dashboard/InspectionsPage'
import InspectionDetail       from './pages/dashboard/InspectionDetail'
import ManagerInspectionDetail from './pages/dashboard/ManagerInspectionDetail'
import FleetPage              from './pages/dashboard/FleetPage'
import DamagePage             from './pages/dashboard/DamagePage'
import ReportsPage            from './pages/dashboard/ReportsPage'
import SettingsPage           from './pages/dashboard/SettingsPage'
import LoanersPage            from './pages/dashboard/LoanersPage'

export default function App() {
  return (
    <AuthProvider>
      <DemoBanner />
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
          <Route index                              element={<InspectionsPage />} />
          <Route path="inspections/:inspectionId"  element={<ManagerInspectionDetail />} />
          <Route path="fleet"                       element={<FleetPage />} />
          <Route path="damage"                      element={<DamagePage />} />
          <Route path="loaners"                     element={<LoanersPage />} />
          <Route path="reports"                     element={<ReportsPage />} />
          <Route path="settings"                    element={<SettingsPage />} />
        </Route>

        {/* ── Catch-all ──────────────────────────────────────────────── */}
        <Route path="*" element={<Navigate to="/" replace />} />

      </Routes>
    </AuthProvider>
  )
}
