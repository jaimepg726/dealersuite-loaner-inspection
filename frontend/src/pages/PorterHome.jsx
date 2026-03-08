/**
 * DealerSuite — Porter Home Screen
 * The first screen a porter sees after login.
 * One giant "Start Inspection" button — nothing else to think about.
 */
import { useNavigate } from 'react-router-dom'
import { Camera, LogOut, Clock } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function PorterHome() {
  const { user, logout, isManager } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-brand-dark flex flex-col">

      {/* Top bar */}
      <header className="flex items-center justify-between px-5 pt-8 pb-2">
        <div>
          <p className="text-gray-400 text-sm">{getGreeting()},</p>
          <h1 className="text-2xl font-extrabold text-brand-white leading-tight">
            {user?.name?.split(' ')[0] || 'Porter'}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          {/* Manager dashboard shortcut */}
          {isManager && (
            <button
              onClick={() => navigate('/dashboard')}
              className="text-xs font-semibold text-brand-blue bg-brand-blue/10
                         border border-brand-blue/30 rounded-xl px-4 py-2"
            >
              Dashboard
            </button>
          )}

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="w-11 h-11 bg-brand-mid border border-brand-accent rounded-xl
                       flex items-center justify-center active:scale-95 transition-transform"
            aria-label="Log out"
          >
            <LogOut className="w-5 h-5 text-gray-400" />
          </button>
        </div>
      </header>

      {/* Main CTA — takes up most of the screen */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 gap-6">

        {/* Giant start button */}
        <button
          onClick={() => navigate('/scan')}
          className="w-full max-w-xs aspect-square rounded-3xl
                     bg-brand-blue flex flex-col items-center justify-center gap-5
                     shadow-2xl shadow-brand-blue/40
                     active:scale-95 transition-transform select-none"
        >
          <Camera className="w-24 h-24 text-white" strokeWidth={1.5} />
          <span className="text-white text-2xl font-extrabold tracking-tight">
            Start Inspection
          </span>
        </button>

        <p className="text-gray-500 text-sm text-center">
          Tap to scan a VIN and begin your walkround
        </p>
      </main>

      {/* Shift time indicator */}
      <footer className="flex items-center justify-center gap-2 pb-10 text-gray-600 text-xs">
        <Clock className="w-4 h-4" />
        <span>Shift token valid 8 hours from login</span>
      </footer>

    </div>
  )
}
