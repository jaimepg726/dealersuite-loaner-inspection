/**
 * DealerSuite — User Card (Settings tab)
 * Shows a single user row with role badge, status, and toggle/reset actions.
 *
 * Props:
 *   user       — UserResponse object
 *   currentId  — logged-in user's id (to prevent self-deactivate)
 *   onUpdated  — called after a successful PATCH so the parent can reload
 */
import { useState } from 'react'
import { UserCircle, ShieldCheck, Wrench, RefreshCw, ToggleLeft, ToggleRight } from 'lucide-react'
import api from '../../utils/api'

const ROLE_STYLE = {
  admin:   { bg: 'bg-purple-900/50  border-purple-700', text: 'text-purple-300', label: 'Admin'   },
  manager: { bg: 'bg-brand-blue/20  border-brand-blue/40', text: 'text-brand-blue', label: 'Manager' },
  porter:  { bg: 'bg-brand-mid      border-brand-accent', text: 'text-gray-400', label: 'Porter'  },
}

const ROLE_ICON = {
  admin:   ShieldCheck,
  manager: Wrench,
  porter:  UserCircle,
}

export default function UserCard({ user, currentId, onUpdated }) {
  const [busy,    setBusy]    = useState(false)
  const [error,   setError]   = useState(null)
  const [reseting, setReseting] = useState(false)
  const [newPass,  setNewPass]  = useState('')
  const [showPass, setShowPass] = useState(false)

  const isSelf   = user.id === currentId
  const roleInfo = ROLE_STYLE[user.role] || ROLE_STYLE.porter
  const RoleIcon = ROLE_ICON[user.role]  || UserCircle

  // ── Toggle active / inactive ──────────────────────────────────────────────
  async function toggleActive() {
    if (isSelf) return
    setBusy(true)
    setError(null)
    try {
      await api.patch(`/api/manager/users/${user.id}`, { is_active: !user.is_active })
      onUpdated()
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not update user')
    } finally {
      setBusy(false)
    }
  }

  // ── Force password reset ─────────────────────────────────────────────────
  async function submitPasswordReset(e) {
    e.preventDefault()
    if (!newPass || newPass.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.patch(`/api/manager/users/${user.id}`, { password: newPass })
      setNewPass('')
      setReseting(false)
      onUpdated()
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not reset password')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`card transition-opacity ${!user.is_active ? 'opacity-50' : ''}`}>

      {/* ── Main row ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">

        {/* Avatar */}
        <div className="w-10 h-10 rounded-full bg-brand-accent flex items-center justify-center shrink-0">
          <RoleIcon className={`w-5 h-5 ${roleInfo.text}`} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-brand-white truncate">{user.name}</span>
            {isSelf && (
              <span className="text-[10px] font-bold text-gray-500 bg-brand-accent
                               px-2 py-0.5 rounded-full uppercase tracking-wide">
                You
              </span>
            )}
          </div>
          <p className="text-gray-500 text-xs truncate">{user.email}</p>
        </div>

        {/* Role badge */}
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full border shrink-0
                          ${roleInfo.bg} ${roleInfo.text}`}>
          {roleInfo.label}
        </span>

        {/* Active toggle */}
        {!isSelf && (
          <button
            onClick={toggleActive}
            disabled={busy}
            className="ml-1 shrink-0 active:scale-95 transition-transform"
            aria-label={user.is_active ? 'Deactivate' : 'Activate'}
            title={user.is_active ? 'Deactivate account' : 'Activate account'}
          >
            {busy
              ? <RefreshCw className="w-5 h-5 text-gray-500 animate-spin" />
              : user.is_active
                ? <ToggleRight className="w-6 h-6 text-green-400" />
                : <ToggleLeft  className="w-6 h-6 text-gray-600" />
            }
          </button>
        )}
      </div>

      {/* ── Last login + Reset password toggle ───────────────────────────── */}
      <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-brand-accent">
        <span className="text-xs text-gray-600">
          {user.last_login
            ? `Last login ${new Date(user.last_login).toLocaleDateString()}`
            : 'Never logged in'}
        </span>

        {!isSelf && (
          <button
            onClick={() => { setReseting(!reseting); setError(null); setNewPass('') }}
            className="text-xs font-semibold text-brand-blue active:opacity-70"
          >
            {reseting ? 'Cancel' : 'Reset password'}
          </button>
        )}
      </div>

      {/* ── Password reset form ───────────────────────────────────────────── */}
      {reseting && (
        <form onSubmit={submitPasswordReset} className="mt-3 flex gap-2">
          <input
            type={showPass ? 'text' : 'password'}
            value={newPass}
            onChange={(e) => setNewPass(e.target.value)}
            placeholder="New password (min 6 chars)"
            className="flex-1 bg-brand-mid border border-brand-accent rounded-xl
                       px-3 py-2 text-sm text-brand-white placeholder-gray-600
                       focus:outline-none focus:border-brand-blue"
            minLength={6}
            required
          />
          <button
            type="button"
            onClick={() => setShowPass(!showPass)}
            className="px-3 py-2 bg-brand-mid border border-brand-accent rounded-xl
                       text-xs text-gray-400"
          >
            {showPass ? 'Hide' : 'Show'}
          </button>
          <button
            type="submit"
            disabled={busy}
            className="px-4 py-2 bg-brand-blue text-white rounded-xl text-sm font-bold
                       active:scale-95 transition-transform disabled:opacity-50"
          >
            {busy ? '…' : 'Set'}
          </button>
        </form>
      )}

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error && (
        <p className="mt-2 text-red-400 text-xs">{error}</p>
      )}
    </div>
  )
}
