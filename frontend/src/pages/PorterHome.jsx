/**
 * DealerSuite — Porter Home Screen
 * Three large buttons: Loaner Out | Loaner Return | Manager Review
 */
import { useNavigate } from 'react-router-dom'
import { LogOut, LogIn, LayoutDashboard, LogOut as LogOutIcon } from 'lucide-react'
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

        <button
          onClick={handleLogout}
          className="w-11 h-11 bg-brand-mid border border-brand-accent rounded-xl
                     flex items-center justify-center active:scale-95 transition-transform"
          aria-label="Log out"
        >
          <LogOutIcon className="w-5 h-5 text-gray-400" />
        </button>
      </header>

      {/* Three action buttons */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 gap-5">

        {/* Loaner Out */}
        <button
          onClick={() => navigate('/scan', { state: { preType: 'checkout' } })}
          className="w-full max-w-sm rounded-3xl bg-brand-blue
                     flex items-center gap-6 px-8 py-7
                     shadow-xl shadow-brand-blue/30
                     active:scale-95 transition-transform select-none"
        >
          <LogOut className="w-12 h-12 text-white shrink-0" strokeWidth={1.5} />
          <div className="text-left">
            <p className="text-white text-2xl font-extrabold">Loaner Out</p>
            <p className="text-blue-200 text-sm">Customer taking a loaner</p>
          </div>
        </button>

        {/* Loaner Return */}
        <button
          onClick={() => navigate('/scan', { state: { preType: 'checkin' } })}
          className="w-full max-w-sm rounded-3xl bg-brand-green
                     flex items-center gap-6 px-8 py-7
                     shadow-xl shadow-brand-green/30
                     active:scale-95 transition-transform select-none"
        >
          <LogIn className="w-12 h-12 text-white shrink-0" strokeWidth={1.5} />
          <div className="text-left">
            <p className="text-white text-2xl font-extrabold">Loaner Return</p>
            <p className="text-green-100 text-sm">Customer returning a loaner</p>
          </div>
        </button>

        {/* Manager Review */}
        <button
          onClick={() => navigate('/dashboard')}
          className="w-full max-w-sm rounded-3xl bg-brand-mid border border-brand-accent
                     flex items-center gap-6 px-8 py-7
                     active:scale-95 transition-transform select-none"
        >
          <LayoutDashboard className="w-12 h-12 text-gray-300 shrink-0" strokeWidth={1.5} />
          <div className="text-left">
            <p className="text-brand-white text-2xl font-extrabold">Manager Review</p>
            <p className="text-gray-500 text-sm">Dashboard &amp; inspections</p>
          </div>
        </button>

      </main>

    </div>
  )
}
