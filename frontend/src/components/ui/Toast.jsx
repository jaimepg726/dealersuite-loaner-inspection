/**
 * Simple toast notification — success / error / info.
 * Shown for 3 seconds then auto-dismissed.
 * Usage: <Toast message="Saved!" type="success" onClose={() => setToast(null)} />
 */
import { useEffect } from 'react'
import { CheckCircle, XCircle, Info, X } from 'lucide-react'

const CONFIG = {
  success: { icon: CheckCircle, bg: 'bg-green-800 border-green-600',  text: 'text-green-100' },
  error:   { icon: XCircle,     bg: 'bg-red-900   border-red-700',    text: 'text-red-100'   },
  info:    { icon: Info,        bg: 'bg-blue-900  border-blue-700',   text: 'text-blue-100'  },
}

export default function Toast({ message, type = 'info', onClose, duration = 3500 }) {
  const { icon: Icon, bg, text } = CONFIG[type] || CONFIG.info

  useEffect(() => {
    const timer = setTimeout(onClose, duration)
    return () => clearTimeout(timer)
  }, [onClose, duration])

  return (
    <div
      className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-50
                  flex items-center gap-3 px-5 py-4 rounded-2xl border
                  shadow-2xl max-w-sm w-[90vw] ${bg}`}
    >
      <Icon className={`w-6 h-6 shrink-0 ${text}`} />
      <p className={`flex-1 text-sm font-semibold ${text}`}>{message}</p>
      <button onClick={onClose} className="shrink-0">
        <X className={`w-5 h-5 ${text} opacity-70`} />
      </button>
    </div>
  )
}
