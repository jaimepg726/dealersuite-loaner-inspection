/**
 * DealerSuite - Manager Settings Page (Batch 3)
 * Sections:
 *  1. Google Drive - OAuth connect/disconnect, health test
 *  2. User Management
 *  3. App Info
 */
import { useState, useEffect, useCallback } from 'react'
import {
  Settings, RefreshCw, HardDrive, CheckCircle, AlertTriangle,
  UserPlus, Users, X, Eye, EyeOff, ExternalLink, Unlink, Zap,
  WifiOff, CloudOff,
} from 'lucide-react'
import api from '../../utils/api'
import { useAuth } from '../../context/AuthContext'
import UserCard from '../../components/dashboard/UserCard'

function SectionTitle({ children }) {
  return (
    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 mt-1">
      {children}
    </p>
  )
}

// ── Drive status card ─────────────────────────────────────────────────────────
function DriveSection() {
  const [status,  setStatus]  = useState(null)
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [revoking, setRevoking] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/api/auth/google/status')
      setStatus(data)
    } catch {
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    // Check if we just returned from OAuth
    const params = new URLSearchParams(window.location.search)
    if (params.get('drive') === 'connected') {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [load])

  async function handleConnect() {
    window.location.href = '/api/auth/google/connect'
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const { data } = await api.get('/api/auth/google/test')
      setTestResult(data)
    } catch (err) {
      setTestResult({ healthy: false, error: err.response?.data?.detail || 'Test failed' })
    } finally {
      setTesting(false)
    }
  }

  async function handleRevoke() {
    if (!window.confirm('Disconnect Google Drive? Inspections will save locally until reconnected.')) return
    setRevoking(true)
    try {
      await api.delete('/api/auth/google/revoke')
      setStatus(null)
      setTestResult(null)
      await load()
    } catch (err) {
      alert(err.response?.data?.detail || 'Could not disconnect')
    } finally {
      setRevoking(false)
    }
  }

  if (loading) {
    return <div className="card h-24 animate-pulse bg-brand-mid" />
  }

  const connected = status?.connected && !status?.token_expired

  return (
    <div className="card flex flex-col gap-4">
      {/* Header row */}
      <div className="flex items-start gap-3">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0
          ${connected ? 'bg-green-500/10' : 'bg-brand-accent'}`}>
          <HardDrive className={`w-6 h-6 ${connected ? 'text-green-400' : 'text-gray-400'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {connected
              ? <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
              : status?.connected
                ? <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0" />
                : <CloudOff className="w-4 h-4 text-gray-500 shrink-0" />
            }
            <span className={`font-bold text-sm ${
              connected ? 'text-green-400' : status?.connected ? 'text-yellow-400' : 'text-gray-400'
            }`}>
              {connected ? 'Drive Connected' : status?.connected ? 'Token Expired' : 'Not Connected'}
            </span>
          </div>

          {connected && (
            <>
              <p className="text-gray-400 text-xs mt-0.5 truncate">{status.email}</p>
              <p className="text-gray-500 text-xs truncate">
                Folder: {status.folder_name}
              </p>
              <p className="text-gray-600 text-xs">
                Mode: <span className="text-green-400 font-semibold">Google Drive</span>
              </p>
            </>
          )}

          {!connected && (
            <p className="text-gray-500 text-xs mt-0.5">
              {status?.connected
                ? 'Token needs refresh — reconnect to restore Drive uploads'
                : 'Connect Google Drive to store inspection videos & damage photos'}
            </p>
          )}
        </div>
      </div>

      {/* Test result */}
      {testResult && (
        <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium ${
          testResult.healthy
            ? 'bg-green-500/10 text-green-400 border border-green-500/20'
            : 'bg-red-500/10 text-red-400 border border-red-500/20'
        }`}>
          {testResult.healthy
            ? <CheckCircle className="w-3 h-3 shrink-0" />
            : <AlertTriangle className="w-3 h-3 shrink-0" />
          }
          <span>
            {testResult.healthy
              ? `Drive OK - ${testResult.files_count} files, folder: ${testResult.folder_name}`
              : testResult.error
            }
          </span>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap">
        {!connected && (
          <button
            onClick={handleConnect}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            <ExternalLink className="w-4 h-4" />
            Connect Google Drive
          </button>
        )}
        {connected && (
          <button
            onClick={handleTest}
            disabled={testing}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <Zap className="w-4 h-4" />
            {testing ? 'Testing...' : 'Test Connection'}
          </button>
        )}
        {connected && (
          <button
            onClick={handleRevoke}
            disabled={revoking}
            className="btn-danger flex items-center gap-2 text-sm"
          >
            <Unlink className="w-4 h-4" />
            {revoking ? 'Disconnecting...' : 'Disconnect'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Add-User modal ────────────────────────────────────────────────────────────
const EMPTY_FORM = { name: '', email: '', password: '', role: 'porter' }

function AddUserModal({ onClose, onCreated }) {
  const [form,    setForm]    = useState(EMPTY_FORM)
  const [busy,    setBusy]    = useState(false)
  const [error,   setError]   = useState(null)
  const [showPw,  setShowPw]  = useState(false)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim() || !form.email.trim() || !form.password) {
      setError('Name, email, and password are required.')
      return
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.post('/api/manager/users', form)
      onCreated()
      onClose()
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not create user')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-brand-dark border border-brand-accent rounded-3xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-extrabold text-brand-white">New User</h3>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-brand-mid flex items-center justify-center">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-semibold text-gray-400 mb-1 block">Full Name</label>
            <input type="text" value={form.name} onChange={set('name')} placeholder="e.g. Carlos Ortega"
              className="w-full bg-brand-mid border border-brand-accent rounded-xl px-4 py-3 text-sm text-brand-white placeholder-gray-600 focus:outline-none focus:border-brand-blue" required />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-400 mb-1 block">Email Address</label>
            <input type="email" value={form.email} onChange={set('email')} placeholder="porter@dealership.com"
              className="w-full bg-brand-mid border border-brand-accent rounded-xl px-4 py-3 text-sm text-brand-white placeholder-gray-600 focus:outline-none focus:border-brand-blue" required />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-400 mb-1 block">Temporary Password</label>
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} value={form.password} onChange={set('password')} placeholder="Min 6 characters"
                className="w-full bg-brand-mid border border-brand-accent rounded-xl px-4 py-3 pr-12 text-sm text-brand-white placeholder-gray-600 focus:outline-none focus:border-brand-blue" minLength={6} required />
              <button type="button" onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" tabIndex={-1}>
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-400 mb-1 block">Role</label>
            <div className="flex gap-2">
              {['porter', 'manager'].map((r) => (
                <button key={r} type="button" onClick={() => setForm((f) => ({ ...f, role: r }))}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-colors
                    ${form.role === r ? 'bg-brand-blue border-brand-blue text-white' : 'bg-brand-mid border-brand-accent text-gray-400'}`}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button type="submit" disabled={busy}
            className="w-full py-4 bg-brand-blue text-white rounded-2xl font-extrabold text-base active:scale-[.97] transition-transform disabled:opacity-50 flex items-center justify-center gap-2 mt-1">
            {busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            {busy ? 'Creating…' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const { user: me } = useAuth()
  const [users,        setUsers]        = useState([])
  const [usersTotal,   setUsersTotal]   = useState(0)
  const [usersLoading, setUsersLoading] = useState(true)
  const [usersError,   setUsersError]   = useState(null)
  const [showInactive, setShowInactive] = useState(false)
  const [roleFilter,   setRoleFilter]   = useState('All')
  const [showAddModal, setShowAddModal] = useState(false)

  const loadUsers = useCallback(async () => {
    setUsersLoading(true)
    setUsersError(null)
    try {
      const params = new URLSearchParams({ limit: 200 })
      if (roleFilter !== 'All') params.set('role', roleFilter.toLowerCase())
      if (!showInactive) params.set('is_active', 'true')
      const { data } = await api.get(`/api/manager/users?${params}`)
      setUsers(data.users)
      setUsersTotal(data.total)
    } catch (err) {
      setUsersError(err.response?.data?.detail || 'Could not load users')
    } finally {
      setUsersLoading(false)
    }
  }, [roleFilter, showInactive])

  useEffect(() => { loadUsers() }, [loadUsers])

  const porterCount  = users.filter((u) => u.role === 'porter'  && u.is_active).length
  const managerCount = users.filter((u) => u.role === 'manager' && u.is_active).length

  return (
    <div className="flex flex-col pb-10">
      <div className="px-5 pt-5 pb-3 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-brand-white">Settings</h2>
          <p className="text-gray-500 text-sm">Drive &amp; user management</p>
        </div>
        <button onClick={loadUsers}
          className="w-11 h-11 bg-brand-mid border border-brand-accent rounded-xl flex items-center justify-center active:scale-95 transition-transform">
          <RefreshCw className={`w-5 h-5 text-gray-400 ${usersLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="px-5 flex flex-col gap-6">
        {/* Google Drive */}
        <div>
          <SectionTitle>Google Drive</SectionTitle>
          <DriveSection />
        </div>

        {/* User Management */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <SectionTitle>Team</SectionTitle>
            <button onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 bg-brand-blue text-white text-xs font-bold px-4 py-2 rounded-xl active:scale-95 transition-transform">
              <UserPlus className="w-3.5 h-3.5" />
              Add User
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-4">
            {[
              { label: 'Total',    value: usersTotal,   color: 'text-brand-white' },
              { label: 'Porters',  value: porterCount,  color: 'text-brand-blue'  },
              { label: 'Managers', value: managerCount, color: 'text-purple-400'  },
            ].map(({ label, value, color }) => (
              <div key={label} className="card py-3 text-center">
                <p className={`text-2xl font-extrabold ${color}`}>{usersLoading ? '…' : value}</p>
                <p className="text-gray-500 text-xs mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {['All', 'Porter', 'Manager'].map((r) => (
              <button key={r} onClick={() => setRoleFilter(r)}
                className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-colors
                  ${roleFilter === r ? 'bg-brand-yellow border-yellow-600 text-black' : 'bg-brand-mid border-brand-accent text-gray-400'}`}>
                {r}
              </button>
            ))}
            <button onClick={() => setShowInactive(!showInactive)}
              className={`ml-auto text-xs font-bold px-3 py-1.5 rounded-full border transition-colors
                ${showInactive ? 'bg-brand-yellow border-yellow-600 text-black' : 'bg-brand-mid border-brand-accent text-gray-400'}`}>
              {showInactive ? 'Hide inactive' : 'Show inactive'}
            </button>
          </div>

          {usersLoading && (
            <div className="flex flex-col gap-3">
              {[...Array(3)].map((_, i) => <div key={i} className="card h-20 animate-pulse bg-brand-mid" />)}
            </div>
          )}
          {!usersLoading && usersError && <p className="text-red-400 text-sm text-center py-8">{usersError}</p>}
          {!usersLoading && !usersError && users.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <Users className="w-12 h-12 text-brand-accent" strokeWidth={1} />
              <p className="text-gray-400 font-semibold">No users found</p>
            </div>
          )}
          {!usersLoading && !usersError && users.length > 0 && (
            <div className="flex flex-col gap-3">
              {users.map((u) => (
                <UserCard key={u.id} user={u} currentId={me?.id} onUpdated={loadUsers} />
              ))}
            </div>
          )}
        </div>

        {/* App Info */}
        <div className="card">
          <SectionTitle>App Info</SectionTitle>
          {[
            { label: 'App',     value: 'DealerSuite Loaner Inspection' },
            { label: 'Version', value: '1.0.0-batch3' },
            { label: 'Storage', value: 'Google Drive (OAuth) + Local Fallback' },
            { label: 'Stack',   value: 'React 18 + FastAPI + Railway' },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between py-2.5 border-b border-brand-accent last:border-0">
              <span className="text-gray-500 text-sm">{label}</span>
              <span className="text-brand-white text-sm font-semibold">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {showAddModal && (
        <AddUserModal onClose={() => setShowAddModal(false)} onCreated={loadUsers} />
      )}
    </div>
  )
}
