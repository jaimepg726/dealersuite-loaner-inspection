/**
 * Redirects unauthenticated users to /login.
 * Optionally requires manager role.
 */
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import LoadingScreen from './LoadingScreen'

export default function ProtectedRoute({ children, requireManager = false }) {
  const { isAuthenticated, isManager, loading } = useAuth()

  if (loading) return <LoadingScreen />
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (requireManager && !isManager) return <Navigate to="/" replace />

  return children
}
