/**
 * Manager layout shell — renders the bottom nav and an <Outlet> for sub-pages.
 */
import { Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import BottomNav from '../components/ui/BottomNav'
import { LogOut } from 'lucide-react'

export default function ManagerLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-brand-dark flex flex-col">

      {/* Top bar */}
      <header className="flex items-center justify-between px-5 pt-8 pb-4
                         border-b border-brand-accent">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-widest">Manager</p>
          <h1 className="text-xl font-extrabold text-brand-white">{user?.name}</h1>
        </div>
        <button
          onClick={handleLogout}
          className="w-11 h-11 bg-brand-mid border border-brand-accent rounded-xl
                     flex items-center justify-center active:scale-95 transition-transform"
          aria-label="Log out"
        >
          <LogOut className="w-5 h-5 text-gray-400" />
        </button>
      </header>

      {/* Page content */}
      <main className="flex-1 overflow-y-auto pb-24">
        <Outlet />
      </main>

      {/* Bottom navigation */}
      <BottomNav />
    </div>
  )
}
