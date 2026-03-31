/**
 * DealerSuite - Porter Home Screen
 * Two large action buttons - New Inspection, Manager Review.
 * Minimal training required for service drive porters.
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, LayoutDashboard, Power, KeyRound, BookOpen, AlertCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import PageHeader from '../components/ui/PageHeader'
import { t } from '../utils/lang'
import api from '../utils/api'

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return t('Good morning', 'Buenos días')
  if (hour < 17) return t('Good afternoon', 'Buenas tardes')
  return t('Good evening', 'Buenas noches')
}

export default function PorterHome() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  // Porter session (set by SelectUserPage — separate from JWT auth)
  const currentUser = (() => {
    try { return JSON.parse(sessionStorage.getItem('currentUser') || 'null') }
    catch { return null }
  })()

  // ── Abandoned upload detection ─────────────────────────────────────────────
  // If the porter closed the app while uploading, ds_upload_pending holds the
  // inspection ID. On app reopen (PorterHome mount), we surface a retry prompt.
  const [pendingUploadId, setPendingUploadId] = useState(null)
  const [retryState, setRetryState] = useState('idle') // 'idle' | 'retrying' | 'done' | 'error'

  useEffect(() => {
    const stored = sessionStorage.getItem('ds_upload_pending')
    if (stored) setPendingUploadId(stored)
  }, [])

  async function handleRetryUpload() {
    if (!pendingUploadId || retryState === 'retrying') return
    setRetryState('retrying')
    try {
      await api.post(`/api/inspect/${pendingUploadId}/complete`, { photo_count: 0, notes: null })
      sessionStorage.removeItem('ds_upload_pending')
      setPendingUploadId(null)
      setRetryState('done')
    } catch {
      setRetryState('error')
    }
  }

  function handleDismissRetry() {
    sessionStorage.removeItem('ds_upload_pending')
    setPendingUploadId(null)
    setRetryState('idle')
  }

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

      {/* Abandoned upload recovery banner */}
      {pendingUploadId && retryState !== 'done' && (
        <div className="mx-5 mb-2 rounded-2xl border border-yellow-600 bg-yellow-900/30 px-4 py-4 flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-yellow-300 font-extrabold text-sm">
                {t('Unfinished inspection', 'Inspección sin terminar')}
              </p>
              <p className="text-yellow-500 text-xs mt-0.5">
                {t(
                  'An inspection upload was interrupted. Would you like to finish saving it?',
                  'Una subida fue interrumpida. ¿Desea terminar de guardarla?'
                )}
              </p>
              {retryState === 'error' && (
                <p className="text-red-400 text-xs mt-1">
                  {t('Could not complete — try again or dismiss.', 'No se pudo completar — intente de nuevo o descarte.')}
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleRetryUpload}
              disabled={retryState === 'retrying'}
              className="flex-1 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50
                         text-white font-bold text-sm rounded-xl py-2.5 active:scale-95 transition-all"
            >
              {retryState === 'retrying'
                ? t('Saving…', 'Guardando…')
                : t('Retry Upload', 'Reintentar')}
            </button>
            <button
              onClick={handleDismissRetry}
              className="flex-1 bg-brand-mid border border-brand-accent text-gray-400
                         font-semibold text-sm rounded-xl py-2.5 active:scale-95 transition-all"
            >
              {t('Dismiss', 'Descartar')}
            </button>
          </div>
        </div>
      )}

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
            <p className="text-white text-2xl font-extrabold leading-tight">{t('New Inspection', 'Nueva Inspección')}</p>
            <p className="text-white/70 text-sm mt-0.5">{t('Start vehicle walkaround', 'Iniciar recorrido del vehículo')}</p>
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
            <p className="text-brand-white text-2xl font-extrabold leading-tight">{t('Manager Review', 'Revisión del Gerente')}</p>
            <p className="text-gray-400 text-sm mt-0.5">{t('View inspections & reports', 'Ver inspecciones y reportes')}</p>
          </div>
        </button>

        {/* Training Guide — visible to all users */}
        <button
          onClick={() => navigate('/instructions')}
          className="w-full flex items-center justify-center gap-2 py-4
                     text-gray-500 text-sm font-semibold
                     active:text-gray-300 transition-colors select-none"
        >
          <BookOpen className="w-4 h-4" />
          {t('Training Guide', 'Guía de Capacitación')}
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
            {t('Change PIN', 'Cambiar PIN')}
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
