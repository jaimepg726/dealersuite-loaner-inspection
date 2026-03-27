/**
 * Reusable page header with optional back button and active-user chip.
 * Used on porter inspection flow pages.
 *
 * Props:
 *   title        — heading text
 *   subtitle     — small text below heading (optional)
 *   showBack     — show the ← back button (default false)
 *   onBack       — override back behaviour (default navigate(-1))
 *   showUserChip — show the "👤 Name [Switch]" chip (default true)
 *                  Pass false on screens where the chip is irrelevant
 *                  (e.g. SelectUserPage itself).
 */
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, User } from 'lucide-react'
import { t } from '../../utils/lang'

export default function PageHeader({
  title,
  subtitle,
  showBack     = false,
  onBack,
  showUserChip = true,
}) {
  const navigate    = useNavigate()
  const handleBack  = onBack || (() => navigate(-1))

  // Read porter session (set by SelectUserPage, cleared on tab close)
  const currentUser = (() => {
    try { return JSON.parse(sessionStorage.getItem('currentUser') || 'null') }
    catch { return null }
  })()

  function handleSwitch() {
    sessionStorage.removeItem('currentUser')
    navigate('/select-user')
  }

  return (
    <header className="flex items-center gap-4 px-5 pt-6 pb-4">
      {showBack && (
        <button
          onClick={handleBack}
          className="w-12 h-12 flex items-center justify-center
                     bg-brand-accent rounded-xl active:scale-95 transition-transform shrink-0"
          aria-label="Go back"
        >
          <ArrowLeft className="w-6 h-6 text-brand-white" />
        </button>
      )}

      <div className="flex-1 min-w-0">
        <h1 className="text-2xl font-extrabold text-brand-white leading-tight truncate">{title}</h1>
        {subtitle && <p className="text-sm text-gray-400 mt-0.5 truncate">{subtitle}</p>}
      </div>

      {showUserChip && currentUser && (
        <div className="flex items-center gap-1.5 bg-brand-mid border border-brand-accent
                        rounded-xl px-3 py-1.5 shrink-0 max-w-[160px]">
          <User className="w-4 h-4 text-gray-400 shrink-0" />
          <span className="text-brand-white text-sm font-semibold truncate">{currentUser.name}</span>
          <button
            onClick={handleSwitch}
            className="text-brand-blue text-xs font-bold ml-1 shrink-0 active:opacity-60"
          >
            {t('Switch', 'Cambiar')}
          </button>
        </div>
      )}
    </header>
  )
}
