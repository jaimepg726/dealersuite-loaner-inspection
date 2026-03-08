/**
 * Reusable page header with optional back button.
 * Used on porter inspection flow pages.
 */
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

export default function PageHeader({ title, subtitle, showBack = false, onBack }) {
  const navigate = useNavigate()

  const handleBack = onBack || (() => navigate(-1))

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
      <div>
        <h1 className="text-2xl font-extrabold text-brand-white leading-tight">{title}</h1>
        {subtitle && <p className="text-sm text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
    </header>
  )
}
