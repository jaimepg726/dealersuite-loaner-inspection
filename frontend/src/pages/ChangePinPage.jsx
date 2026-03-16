/**
 * ChangePinPage — Self-service PIN change for advisors and managers.
 *
 * Flow:
 *   current → new → confirm → done
 *
 * PINs are stored in localStorage as `pin_<name>` so they persist across
 * sessions. Move the read/write calls to a backend API endpoint when ready.
 *
 * Only reachable when sessionStorage.currentUser.role !== 'porter'.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle, Home } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'

// ── PIN storage helpers (swap these two functions for API calls when ready) ──
function readPin(name)         { return localStorage.getItem(`pin_${name}`) ?? '0000' }
function savePin(name, pin)    { localStorage.setItem(`pin_${name}`, pin) }

// ── Step metadata ─────────────────────────────────────────────────────────────
const STEPS = {
  current: { label: 'Current PIN',  hint: 'Enter your current PIN to continue' },
  new:     { label: 'New PIN',      hint: 'Choose a new 4-digit PIN' },
  confirm: { label: 'Confirm PIN',  hint: 'Re-enter your new PIN to confirm' },
}
const STEP_ORDER = ['current', 'new', 'confirm']

// ── Number pad ────────────────────────────────────────────────────────────────
function NumPad({ onDigit, onBackspace }) {
  const btnCls = 'h-16 rounded-xl bg-brand-accent text-brand-white text-2xl font-bold ' +
                 'active:scale-95 transition-transform select-none'
  return (
    <div className="w-full max-w-xs grid grid-cols-3 gap-3">
      {[1,2,3,4,5,6,7,8,9].map(n => (
        <button key={n} onClick={() => onDigit(String(n))} className={btnCls}>{n}</button>
      ))}
      <div />  {/* spacer */}
      <button onClick={() => onDigit('0')} className={btnCls}>0</button>
      <button
        onClick={onBackspace}
        className={btnCls + ' flex items-center justify-center'}
        aria-label="Backspace"
      >⌫</button>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ChangePinPage() {
  const navigate = useNavigate()

  const currentUser = (() => {
    try { return JSON.parse(sessionStorage.getItem('currentUser') || 'null') }
    catch { return null }
  })()

  const [step,    setStep]    = useState('current')
  const [digits,  setDigits]  = useState([])
  const [newPin,  setNewPin]  = useState('')
  const [error,   setError]   = useState('')
  const [shake,   setShake]   = useState(false)

  // Porters have no PIN — shouldn't reach this page
  if (!currentUser || currentUser.role === 'porter') {
    navigate('/', { replace: true })
    return null
  }

  function triggerError(msg) {
    setShake(true)
    setError(msg)
    setDigits([])
    setTimeout(() => { setShake(false); setError('') }, 1500)
  }

  function handleDigit(d) {
    if (digits.length >= 4) return
    const next = [...digits, d]
    setDigits(next)
    if (next.length === 4) handleComplete(next)
  }

  function handleBackspace() {
    setDigits(prev => prev.slice(0, -1))
    setError('')
  }

  function handleComplete(entered) {
    const enteredStr = entered.join('')

    if (step === 'current') {
      if (enteredStr === readPin(currentUser.name)) {
        setDigits([])
        setError('')
        setStep('new')
      } else {
        triggerError('Incorrect current PIN')
      }
      return
    }

    if (step === 'new') {
      setNewPin(enteredStr)
      setDigits([])
      setError('')
      setStep('confirm')
      return
    }

    if (step === 'confirm') {
      if (enteredStr === newPin) {
        savePin(currentUser.name, newPin)
        setStep('done')
      } else {
        triggerError("PINs don't match — try again")
        setNewPin('')
        setStep('new')
      }
    }
  }

  // ── Done screen ─────────────────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <div className="min-h-screen bg-brand-dark flex flex-col">
        <PageHeader title="Change PIN" showBack={false} showUserChip={false} />
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 text-center">
          <div className="w-24 h-24 rounded-full bg-green-900/40 border-2 border-green-600
                          flex items-center justify-center">
            <CheckCircle className="w-14 h-14 text-green-400" />
          </div>
          <div>
            <p className="text-2xl font-extrabold text-brand-white">PIN Updated</p>
            <p className="text-gray-400 text-sm mt-1">
              Your PIN has been changed successfully
            </p>
          </div>
          <button
            onClick={() => navigate('/')}
            className="btn-primary mt-2"
          >
            <Home className="w-5 h-5" />
            Back to Home
          </button>
        </div>
      </div>
    )
  }

  // ── Entry screen ────────────────────────────────────────────────────────────
  const { label, hint } = STEPS[step]
  const stepIndex = STEP_ORDER.indexOf(step)

  return (
    <div className="min-h-screen bg-brand-dark flex flex-col">
      <PageHeader title="Change PIN" showBack showUserChip={false} />

      <main className="flex-1 flex flex-col items-center justify-center px-6 gap-7">

        {/* Step dots */}
        <div className="flex gap-2.5">
          {STEP_ORDER.map((s, i) => (
            <div key={s} className={`w-2.5 h-2.5 rounded-full transition-all ${
              i === stepIndex
                ? 'bg-brand-blue scale-125'
                : i < stepIndex
                  ? 'bg-green-400'
                  : 'bg-brand-accent'
            }`} />
          ))}
        </div>

        {/* Step title */}
        <div className="text-center">
          <p className="text-brand-white font-extrabold text-xl">{label}</p>
          <p className="text-gray-400 text-sm mt-1">{hint}</p>
          {step === 'current' && (
            <p className="text-gray-600 text-xs mt-0.5">
              Default PIN is 0000 if never changed
            </p>
          )}
        </div>

        {/* 4-dot indicator */}
        <div className={`flex justify-center gap-5 ${shake ? 'animate-shake' : ''}`}>
          {[0, 1, 2, 3].map(i => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
                i < digits.length
                  ? 'bg-brand-blue border-brand-blue scale-110'
                  : 'bg-transparent border-gray-600'
              }`}
            />
          ))}
        </div>

        {/* Error message */}
        {error && (
          <p className="text-red-400 text-sm font-semibold -mt-4">{error}</p>
        )}

        {/* Number pad */}
        <NumPad onDigit={handleDigit} onBackspace={handleBackspace} />

        {/* Cancel */}
        <button
          onClick={() => navigate('/')}
          className="text-gray-600 text-sm font-semibold active:text-gray-400 transition-colors"
        >
          Cancel
        </button>

      </main>
    </div>
  )
}
