/**
 * DealerSuite - Manager Settings Page
 * Sections:
 *  1. Google Drive - OAuth connect/disconnect, health test
 *  2. System Status
 *  3. Demo Mode
 *  4. User Management
 *  5. App Info
 */
import { useState, useEffect, useCallback } from 'react'
import {
  Settings, RefreshCw, HardDrive, CheckCircle,
  UserPlus, Users, X, Eye, EyeOff, ExternalLink, Unlink, Zap,
  WifiOff, CloudOff, Activity, Database, BookOpen, ChevronRight, Trash2,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
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

// ââ Drive status card âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
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

  function handleConnect() {
    const token = localStorage.getItem('ds_token')
    window.location.href = `/api/auth/google/connect?token=${token}`
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

  const connected = status?.connected

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
              : <CloudOff className="w-4 h-4 text-gray-500 shrink-0" />
            }
            <span className={`font-bold text-sm ${connected ? 'text-green-400' : 'text-gray-400'}`}>
              {connected ? 'Drive Connected' : 'Not Connected'}
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
              Connect Google Drive to store inspection videos &amp; damage photos
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

// ââ System Status section ââââââââââââââââââââââââââââââââââââââââââââââââââââââ
function SystemStatusSection() {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/system/status')
      .then(({ data }) => setStatus(data))
      .catch(() => setStatus(null))
      .finally(() => setLoading(false))
  }, [])

  // backend returns: { database:"ok", storage_mode:"drive", google_drive_connected:bool, version:"1.0" }
  const cards = status ? [
    { label: 'API Status',     value: 'Online',                                          ok: true,                        icon: <Activity className="w-4 h-4" /> },
    { label: 'Database',       value: status.database === 'ok' ? 'Connected' : 'Error',  ok: status.database === 'ok',    icon: <Database className="w-4 h-4" /> },
    { label: 'Storage Mode',   value: status.storage_mode === 'drive' ? 'Google Drive' : 'Local', ok: true,              icon: <HardDrive className="w-4 h-4" /> },
    { label: 'Google Drive',   value: status.google_drive_connected ? 'Connected' : 'Not Connected', ok: status.google_drive_connected, icon: <CheckCircle className="w-4 h-4" /> },
    { label: 'Backend Version',value: status.version || '1.0',                           ok: true,                        icon: <Settings className="w-4 h-4" /> },
  ] : []

  if (loading) return <div className="card h-32 animate-pulse bg-brand-mid" />
  if (!status) return (
    <div className="card flex items-center gap-3 text-red-400 text-sm">
      <WifiOff className="w-5 h-5 shrink-0" />
      Could not load system status
    </div>
  )

  return (
    <div className="card flex flex-col gap-0">
      {cards.map(({ label, value, ok, icon }) => (
        <div key={label} className="flex items-center justify-between py-2.5 border-b border-brand-accent last:border-0">
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <span className={ok ? 'text-green-400' : 'text-red-400'}>{icon}</span>
            {label}
          </div>
          <span className={`text-sm font-semibold ${ok ? 'text-brand-white' : 'text-red-400'}`}>
            {value}
          </span>
        </div>
      ))}
    </div>
  )
}


// ââ Add-User modal ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
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
            {busy ? 'Creatingâ¦' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Cleanup Tools section (manager / admin only) ─────────────────────────────
function CleanupToolsSection() {
  const [previewData,    setPreviewData]    = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError,   setPreviewError]   = useState(null)
  const [showConfirm,    setShowConfirm]    = useState(false)
  const [executing,      setExecuting]      = useState(false)
  const [executeResult,  setExecuteResult]  = useState(null)
  const [executeError,   setExecuteError]   = useState(null)

  async function handlePreview() {
    setPreviewLoading(true)
    setPreviewError(null)
    setPreviewData(null)
    setExecuteResult(null)
    setShowConfirm(false)
    try {
      const { data } = await api.post('/api/manager/cleanup-junk-preview')
      setPreviewData(data)
    } catch (err) {
      setPreviewError(err.response?.data?.detail || 'Preview failed')
    } finally {
      setPreviewLoading(false)
    }
  }

  async function handleExecute() {
    setExecuting(true)
    setExecuteError(null)
    try {
      const { data } = await api.post('/api/manager/cleanup-junk-execute')
      setExecuteResult(data)
      setPreviewData(null)
      setShowConfirm(false)
    } catch (err) {
      setExecuteError(err.response?.data?.detail || 'Cleanup failed')
    } finally {
      setExecuting(false)
    }
  }

  return (
    <div className="card flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 bg-red-500/10">
          <Trash2 className="w-5 h-5 text-red-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm text-brand-white">Cleanup Tools</p>
          <p className="text-gray-500 text-xs mt-0.5 leading-relaxed">
            Removes junk in-progress inspections with no uploaded media, and deletes
            test damage records. Does not touch Drive files or completed inspections with media.
          </p>
        </div>
      </div>

      {/* Preview result */}
      {previewData && !executeResult && (
        <div className="bg-brand-accent rounded-xl px-4 py-3 flex flex-col gap-2">
          <p className="text-gray-400 text-xs font-bold uppercase tracking-wide mb-0.5">
            Preview — no changes made
          </p>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">Junk inspections to delete</span>
            <span className={`font-bold ${previewData.junk_inspections_to_delete > 0 ? 'text-red-400' : 'text-gray-400'}`}>
              {previewData.junk_inspections_to_delete}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">Completed / no media (skipped)</span>
            <span className="font-bold text-gray-400">{previewData.completed_no_media_skipped}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">Damage records to delete</span>
            <span className={`font-bold ${previewData.damage_records_to_delete > 0 ? 'text-red-400' : 'text-gray-400'}`}>
              {previewData.damage_records_to_delete}
            </span>
          </div>
        </div>
      )}

      {/* Execute result */}
      {executeResult && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3 flex flex-col gap-2">
          <p className="text-green-400 text-xs font-bold uppercase tracking-wide mb-0.5">
            Cleanup complete
          </p>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">Junk inspections deleted</span>
            <span className="font-bold text-brand-white">{executeResult.deleted_junk_inspections}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">Damage records deleted</span>
            <span className="font-bold text-brand-white">{executeResult.deleted_damage_records}</span>
          </div>
          <p className="text-gray-600 text-xs mt-0.5">{executeResult.note}</p>
        </div>
      )}

      {/* Errors */}
      {previewError && <p className="text-red-400 text-xs">{previewError}</p>}
      {executeError && <p className="text-red-400 text-xs">{executeError}</p>}

      {/* Confirmation step */}
      {showConfirm && !executeResult && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 flex flex-col gap-3">
          <p className="text-red-300 text-sm font-semibold">
            This will permanently delete junk inspections and all damage records. Proceed?
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleExecute}
              disabled={executing}
              className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-bold text-sm
                         flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              {executing && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              {executing ? 'Deleting…' : 'Yes, Delete'}
            </button>
            <button
              onClick={() => { setShowConfirm(false); setExecuteError(null) }}
              disabled={executing}
              className="flex-1 py-2.5 bg-brand-mid border border-brand-accent text-gray-300 rounded-xl
                         font-bold text-sm active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Primary action buttons */}
      {!showConfirm && !executeResult && (
        <div className="flex gap-2">
          <button
            onClick={handlePreview}
            disabled={previewLoading || executing}
            className="flex-1 py-2.5 bg-brand-mid border border-brand-accent text-gray-300 rounded-xl
                       font-bold text-sm flex items-center justify-center gap-2
                       active:scale-[0.98] transition-transform disabled:opacity-50"
          >
            {previewLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
            {previewLoading ? 'Loading…' : 'Preview'}
          </button>
          <button
            onClick={() => { setShowConfirm(true); setExecuteError(null) }}
            disabled={previewLoading || executing}
            className="flex-1 py-2.5 bg-red-600/80 text-white rounded-xl font-bold text-sm
                       flex items-center justify-center gap-2
                       active:scale-[0.98] transition-transform disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Run Cleanup
          </button>
        </div>
      )}

      {/* Allow re-running after success */}
      {executeResult && (
        <button
          onClick={() => { setExecuteResult(null); setPreviewData(null) }}
          className="text-xs text-gray-600 hover:text-gray-400 transition-colors text-center"
        >
          Run again
        </button>
      )}
    </div>
  )
}


// ââ Main page âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
export default function SettingsPage() {
  const { user: me, isManager } = useAuth()
  const navigate = useNavigate()
  const [users,        setUsers]        = useState([])
  const [usersTotal,   setUsersTotal]   = useState(0)
  const [usersLoading, setUsersLoading] = useState(true)
  const [usersError,   setUsersError]   = useState(null)
  const [showInactive, setShowInactive] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)

  const loadUsers = useCallback(async () => {
    setUsersLoading(true)
    setUsersError(null)
    try {
      const params = new URLSearchParams({ limit: 200 })
      if (!showInactive) params.set('is_active', 'true')
      const { data } = await api.get(`/api/manager/users?${params}`)
      setUsers(data.users)
      setUsersTotal(data.total)
    } catch (err) {
      setUsersError(err.response?.data?.detail || 'Could not load users')
    } finally {
      setUsersLoading(false)
    }
  }, [showInactive])

  useEffect(() => { loadUsers() }, [loadUsers])


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
        {/* Instructions */}
        <div>
          <SectionTitle>Instructions</SectionTitle>
          <button
            onClick={() => navigate('/dashboard/instructions')}
            className="w-full card flex items-center gap-4 text-left active:scale-[0.99] transition-transform"
          >
            <div className="w-11 h-11 bg-brand-blue/10 rounded-2xl flex items-center justify-center shrink-0">
              <BookOpen className="w-5 h-5 text-brand-blue" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm text-brand-white">Staff Training Guide</p>
              <p className="text-gray-500 text-xs mt-0.5">
                Step-by-step instructions in English and Spanish
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />
          </button>
        </div>

        {/* Google Drive */}
        <div>
          <SectionTitle>Google Drive</SectionTitle>
          <DriveSection />
        </div>

        {/* System Status */}
        <div>
          <SectionTitle>System Status</SectionTitle>
          <SystemStatusSection />
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

          <button
            onClick={() => setShowInactive(!showInactive)}
            className="mt-2 text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            {showInactive ? 'Hide inactive users' : 'Show inactive users'}
          </button>
        </div>

        {/* Cleanup Tools — manager / admin only */}
        {isManager && (
          <div>
            <SectionTitle>Cleanup Tools</SectionTitle>
            <CleanupToolsSection />
          </div>
        )}

        {/* App Info */}
        <p className="text-center text-gray-600 text-xs pb-2">
          DealerSuite Loaner Inspection&nbsp;&middot;&nbsp;v1.0.0
        </p>
      </div>

      {showAddModal && (
        <AddUserModal onClose={() => setShowAddModal(false)} onCreated={loadUsers} />
      )}
    </div>
  )
}
