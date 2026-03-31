/**
 * SelectUserPage — Porter name picker for the inspection flow.
 *
 * Appears when a porter starts an inspection and no active session exists.
 * Does NOT replace JWT login — it layers a sessionStorage "who is doing this
 * inspection" selection on top of the existing auth system.
 *
 * Porters   → tap name → session set → proceed immediately (no PIN)
 * Advisors  → tap name → PIN modal → session set on success
 * Manager   → tap name → PIN modal → session set on success
 *
 * Session is stored in sessionStorage (cleared on tab close) as:
 *   { name: string, role: string }
 *
 * PIN config lives in USERS below — easy to move to a backend endpoint later.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PinEntryModal from '../components/ui/PinEntryModal'

// ── User roster (move to /api/users endpoint when ready) ─────────────────────
// PINs default to '0000' — overridden by localStorage key `pin_<name>` if set.
// Use getStoredPin() everywhere so ChangePinPage changes take effect immediately.
const USERS = [
  { name: 'John',    role: 'porter',  lang: 'es' },
  { name: 'Basilio', role: 'porter',  lang: 'es' },
  { name: 'Ronald',  role: 'advisor', pin: '0000' },
  { name: 'Octavio', role: 'advisor', pin: '0000' },
  { name: 'Jaime',   role: 'manager', pin: '0000' },
]

/** Returns the stored PIN for a user, falling back to '0000'. */
export function getStoredPin(name) {
  return localStorage.getItem(`pin_${name}`) ?? '0000'
}

const ROLE_GROUPS = [
  { label: 'PORTERS',  roles: ['porter']  },
  { label: 'ADVISORS', roles: ['advisor'] },
  { label: 'MANAGER',  roles: ['manager'] },
]

// ── Component ─────────────────────────────────────────────────────────────────
export default function SelectUserPage() {
  const navigate    = useNavigate()
  const [pinTarget, setPinTarget] = useState(null)  // user awaiting PIN entry

  function handleUserTap(user) {
    if (user.role === 'porter') {
      saveAndContinue(user)
    } else {
      // Pass the live localStorage PIN so PinEntryModal doesn't need to re-read it,
      // but PinEntryModal also does its own localStorage lookup as a second source of truth.
      setPinTarget({ ...user, pin: getStoredPin(user.name) })
    }
  }

  function handlePinSuccess(user) {
    setPinTarget(null)
    saveAndContinue(user)
  }

  function saveAndContinue(user) {
    // Write to sessionStorage BEFORE navigate so any mounted effect that reads
    // currentUser sees the value immediately (sessionStorage.setItem is sync).
    sessionStorage.setItem('currentUser', JSON.stringify({
      name: user.name,
      role: user.role,
      lang: user.lang || 'en',
    }))
    // replace: true removes SelectUserPage from the browser history stack.
    // Without this, pressing the back button from /scan returns to /select-user,
    // which re-renders SelectUserPage and can trigger another redirect cycle.
    navigate('/scan', { replace: true })
  }

  return (
    <div className="min-h-screen bg-brand-dark flex flex-col">

      {/* Header */}
      <header className="px-5 pt-safe pt-6 pb-4">
        <h1 className="text-2xl font-extrabold text-brand-white leading-tight">
          Who's doing this inspection?
        </h1>
        <p className="text-gray-400 text-sm mt-1">Tap your name to continue</p>
      </header>

      {/* User groups */}
      <main className="flex-1 px-5 pb-safe pb-8 flex flex-col gap-6">
        {ROLE_GROUPS.map(({ label, roles }) => {
          const groupUsers = USERS.filter(u => roles.includes(u.role))
          if (!groupUsers.length) return null
          return (
            <div key={label}>
              <p className="text-xs font-bold text-gray-500 tracking-widest uppercase mb-2">
                {label}
              </p>
              <div className="flex flex-col gap-2">
                {groupUsers.map(user => (
                  <button
                    key={user.name}
                    onClick={() => handleUserTap(user)}
                    className="w-full min-h-[80px] bg-brand-mid border border-brand-accent
                               rounded-xl flex items-center px-5
                               active:scale-[0.98] active:border-brand-blue
                               transition-all duration-100"
                  >
                    <span className="text-lg font-bold text-brand-white">{user.name}</span>
                    {user.role !== 'porter' && (
                      <span className="ml-auto text-xs text-gray-500 font-semibold tracking-wide">
                        PIN required
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </main>

      {/* PIN modal overlay */}
      {pinTarget && (
        <PinEntryModal
          user={pinTarget}
          onSuccess={handlePinSuccess}
          onCancel={() => setPinTarget(null)}
        />
      )}

    </div>
  )
}
