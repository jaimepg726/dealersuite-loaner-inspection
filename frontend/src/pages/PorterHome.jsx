/**
 * DealerSuite â Porter Home Screen
 * Three large action buttons â Loaner Out, Loaner Return, Manager Review.
 * Minimal training required for service drive porters.
 */
import { useNavigate } from 'react-router-dom'
import { LogOut, LogIn, LayoutDashboard, Power, Clock } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function PorterHome() {
  const { user, logout } = useAuth()
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

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-11 h-11 bg-brand-mid border border-brand-accent rounded-xl
                     flex items-center justify-center active:scale-95 transition-transform"
          aria-label="Log out"
        >
          <Power className="w-5 h-5 text-gray-400" />
        </button>
      </header>

      {/* Main actions */}
      <main className="flex-1 flex flex-col justify-center px-6 gap-4 pb-6">

        {/* Loaner Out */}
        <button
          onClick={() => navigate('/scan', { state: { inspectionType: 'checkout' } })}
          className="w-full bg-brand-blue rounded-3xl p-6 flex items-center gap-5
                     shadow-2xl shadow-brand-blue/40 active:scale-95 transition-transform select-none"
        >
          <div className="bg-white/20 w-16 h-16 rounded-2xl flex items-center justify-center shrink-0">
            <LogOut className="w-9 h-9 text-white" strokeWidth={1.5} />
          </div>
          <div className="text-left">
            <p className="text-white text-2xl font-extrabold leading-tight">Loaner Out</p>
            <p className="text-white/70 text-sm mt-0.5">Customer taking a loaner</p>
          </div>
        </button>

        {/* Loaner Return */}
        <button
          onClick={() => navigate('/scan', { state: { inspectionType: 'checkin' } })}
          className="w-full bg-green-700 rounded-3xl p-6 flex items-center gap-5
                     shadow-2xl shadow-green-700/40 active:scale-95 transition-transform select-none"
        >
          <div className="bg-white/20 w-16 h-16 rounded-2xl flex items-center justify-center shrink-0">
            <LogIn className="w-9 h-9 text-white" strokeWidth={1.5} />
          </div>
          <div className="text-left">
            <p className="text-white text-2xl font-extrabold leading-tight">Loaner Return</p>
            <p className="text-white/70 text-sm mt-0.5">Customer returning a loaner</p>
          </div>
        </button>

        {/* Manager Review */}
        <button
          onClick={() => navigate('/dashboard')}
          className="w-full bg-brand-mid border border-brand-accent rounded-3xl p-6
                     flex items-center gap-5 active:scale-95 transition-transform select-none"
        >
          <div className="bg-brand-accent/60 w-16 h-16 rounded-2xl flex items-center justify-center shrink-0">
            <LayoutDashboard className="w-9 h-9 text-gray-300" strokeWidth={1.5} />
          </div>
          <div className="text-left">
            <p className="text-brand-white text-2xl font-extrabold leading-tight">Manager Review</p>
            <p className="text-gray-400 text-sm mt-0.5">View inspections &amp; reports</p>
          </div>
        </button>

      </main>

      {/* Shift time indicator */}
      <footer className="flex items-center justify-center gap-2 pb-10 text-gray-600 text-xs">
        <Clock className="w-4 h-4" />
        <span>Shift token valid 8 hours from login</span>
      </footer>

    </div>
  )
}
