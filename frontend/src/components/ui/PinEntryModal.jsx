/**
 * PinEntryModal — iPad-optimised 4-digit PIN pad.
 *
 * Props:
 *   user      — { name, role, pin }
 *   onSuccess — called with user on correct PIN
 *   onCancel  — called when porter taps Cancel
 */
import { useState, useEffect } from 'react'

const MAX_ATTEMPTS    = 3
const LOCKOUT_SECONDS = 30

export default function PinEntryModal({ user, onSuccess, onCancel }) {
  const [digits,        setDigits]        = useState([])
  const [error,         setError]         = useState('')
  const [shake,         setShake]         = useState(false)
  const [attempts,      setAttempts]      = useState(0)
  const [lockedUntil,   setLockedUntil]   = useState(null)
  const [lockRemaining, setLockRemaining] = useState(0)

  // Countdown tick during lockout
  useEffect(() => {
    if (!lockedUntil) return
    const tick = setInterval(() => {
      const remaining = Math.ceil((lockedUntil - Date.now()) / 1000)
      if (remaining <= 0) {
        setLockedUntil(null)
        setAttempts(0)
        setError('')
        setLockRemaining(0)
      } else {
        setLockRemaining(remaining)
      }
    }, 1000)
    return () => clearInterval(tick)
  }, [lockedUntil])

  const locked = !!lockedUntil

  function pressDigit(d) {
    if (locked || digits.length >= 4) return
    const next = [...digits, d]
    setDigits(next)
    if (next.length === 4) checkPin(next)
  }

  function pressBackspace() {
    if (locked) return
    setDigits(prev => prev.slice(0, -1))
    setError('')
  }

  function checkPin(entered) {
    // Always read from localStorage so a PIN changed via ChangePinPage takes
    // effect immediately without re-mounting the modal.
    const correctPin = localStorage.getItem(`pin_${user.name}`) ?? '0000'
    if (entered.join('') === correctPin) {
      onSuccess(user)
      return
    }
    const next = attempts + 1
    setAttempts(next)
    setDigits([])
    setShake(true)
    setTimeout(() => setShake(false), 550)

    if (next >= MAX_ATTEMPTS) {
      const until = Date.now() + LOCKOUT_SECONDS * 1000
      setLockedUntil(until)
      setLockRemaining(LOCKOUT_SECONDS)
      setError(`Too many attempts — locked`)
    } else {
      const left = MAX_ATTEMPTS - next
      setError(`Incorrect PIN — ${left} attempt${left !== 1 ? 's' : ''} left`)
      setTimeout(() => setError(''), 1500)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-end sm:items-center justify-center p-4">
      <div className="w-full max-w-sm bg-brand-mid border border-brand-accent rounded-2xl p-6 flex flex-col gap-5">

        {/* Name + prompt */}
        <div className="text-center">
          <p className="text-brand-white font-extrabold text-xl">{user.name}</p>
          <p className="text-gray-400 text-sm mt-0.5">Enter your PIN to continue</p>
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

        {/* Error / lockout message */}
        {(error || locked) && (
          <p className="text-center text-red-400 text-sm font-semibold -mt-2">
            {locked ? `Locked — try again in ${lockRemaining}s` : error}
          </p>
        )}

        {/* Number pad */}
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
            <button
              key={n}
              onClick={() => pressDigit(String(n))}
              disabled={locked}
              className="h-16 rounded-xl bg-brand-accent text-brand-white text-2xl font-bold
                         active:scale-95 transition-transform disabled:opacity-40 select-none"
            >
              {n}
            </button>
          ))}

          {/* Bottom row */}
          <button
            onClick={onCancel}
            className="h-16 rounded-xl text-gray-500 text-sm font-semibold
                       active:opacity-60 transition-opacity select-none"
          >
            Cancel
          </button>
          <button
            onClick={() => pressDigit('0')}
            disabled={locked}
            className="h-16 rounded-xl bg-brand-accent text-brand-white text-2xl font-bold
                       active:scale-95 transition-transform disabled:opacity-40 select-none"
          >
            0
          </button>
          <button
            onClick={pressBackspace}
            disabled={locked}
            className="h-16 rounded-xl bg-brand-accent text-brand-white text-xl
                       active:scale-95 transition-transform disabled:opacity-40
                       flex items-center justify-center select-none"
            aria-label="Backspace"
          >
            ⌫
          </button>
        </div>

      </div>
    </div>
  )
}
