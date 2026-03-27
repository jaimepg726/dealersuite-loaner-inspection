/**
 * DealerSuite - Porter Home Screen
 * Two large action buttons - New Inspection, Manager Review.
 * Minimal training required for service drive porters.
 */
import { useNavigate } from 'react-router-dom'
import { Camera, LayoutDashboard, Power, KeyRound } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import PageHeader from '../components/ui/PageHeader'

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function PorterHome() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  // Porter session (set by SelectUserPage — separate from JWT auth)
  const currentUser = (() => {
    try { return JSON.parse(sessionStorage.getItem('currentUser') || 'null') }
    catch { return null }
  })()

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  // Bug 3 fix: enforce user selection before starting an inspection
  function handleNewInspection() {
    if (!sessionStorage.getItem('currentUser')) {
      navigate('/select-user')
      return
    }
    navigate('/scan')
  }

  return (
    <div className="min-h-screen bg-brand-dark flex flex-col">

      {/* Bug 2 fix: PageHeader renders the 👤 Name [Switch] chip from sessionStorage */}
      <PageHeader
        title={`${getGreeting()}, ${(currentUser?.name ?? user?.name)?.split(' ')[0] || 'Porter'}`}
        showBack={false}
        showUserChip={true}
      />

      {/* Main actions */}
      <main className="flex-1 flex flex-col justify-center px-6 gap-4 pb-6">

        {/* New Inspection */}
        <button
          onClick={handleNewInspection}
          className="w-full bg-brand-blue rounded-3xl p-6 flex items-center gap-5
                     shadow-2xl shadow-brand-blue/40 active:scale-95 transition-transform select-none"
        >
          <div className="bg-white/20 w-16 h-16 rounded-2xl flex items-center justify-center shrink-0">
            <Camera className="w-9 h-9 text-white" strokeWidth={1.5} />
          </div>
          <div className="text-left">
            <p className="text-white text-2xl font-extrabold leading-tight">New Inspection</p>
            <p className="text-white/70 text-sm mt-0.5">Start vehicle walkaround</p>
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

        {/* Change PIN — only visible for advisor / manager sessions */}
        {currentUser && currentUser.role !== 'porter' && (
          <button
            onClick={() => navigate('/change-pin')}
            className="w-full flex items-center justify-center gap-2 py-4
                       text-gray-500 text-sm font-semibold
                       active:text-gray-300 transition-colors select-none"
          >
            <KeyRound className="w-4 h-4" />
            Change PIN
          </button>
        )}

      </main>

      {/* Footer: shift info + logout */}
      <footer className="flex items-center justify-end px-6 pb-10">
        <button
          onClick={handleLogout}
          className="w-10 h-10 bg-brand-mid border border-brand-accent rounded-xl
                     flex items-center justify-center active:scale-95 transition-transform"
          aria-label="Log out"
        >
          <Power className="w-4 h-4 text-gray-400" />
        </button>
      </footer>

    </div>
  )
}
