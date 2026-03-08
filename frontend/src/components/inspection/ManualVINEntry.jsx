/**
 * DealerSuite — Manual VIN Entry
 * Large keyboard-friendly input.
 * Auto-uppercases, strips invalid chars, shows live validation state.
 * Keyboard hints set for numbers+letters on mobile.
 */

import { useState } from 'react'
import { Keyboard, CheckCircle, XCircle } from 'lucide-react'
import { validateVIN } from '../../hooks/useVINValidation'

// Render each VIN character as a coloured block (like a VIN decoder display)
function VINDisplay({ vin }) {
  const chars = vin.padEnd(17, '_').split('')
  return (
    <div className="flex flex-wrap justify-center gap-1 mt-2">
      {chars.map((ch, i) => (
        <span
          key={i}
          className={`w-8 h-10 flex items-center justify-center rounded-lg text-sm font-mono font-bold
            ${ch === '_'
              ? 'bg-brand-accent text-gray-600'
              : 'bg-brand-blue/20 border border-brand-blue text-brand-white'
            }`}
        >
          {ch}
        </span>
      ))}
    </div>
  )
}

export default function ManualVINEntry({ onDetected }) {
  const [raw,   setRaw]   = useState('')
  const [error, setError] = useState(null)

  const { valid, vin, error: valError } = validateVIN(raw)

  function handleChange(e) {
    // Strip anything not alphanumeric, uppercase
    const cleaned = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')
    setRaw(cleaned.slice(0, 17))
    setError(null)
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!valid) {
      setError(valError)
      return
    }
    if (navigator.vibrate) navigator.vibrate(60)
    onDetected(vin)
  }

  const charCount = raw.length
  const remaining = 17 - charCount

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 w-full max-w-sm mx-auto">

      <div className="flex items-center gap-3 mb-1">
        <Keyboard className="w-6 h-6 text-brand-blue shrink-0" />
        <p className="text-gray-300 text-sm">
          Type the 17-character VIN — letters and numbers only
        </p>
      </div>

      {/* VIN character blocks */}
      <VINDisplay vin={raw} />

      {/* Input */}
      <div className="relative">
        <input
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          value={raw}
          onChange={handleChange}
          placeholder="e.g. WMW23GD0XP2R12345"
          maxLength={17}
          className={`w-full bg-brand-mid border rounded-xl px-4 py-4 pr-16
                      text-brand-white text-lg font-mono tracking-widest
                      placeholder-gray-600 focus:outline-none transition-colors
                      ${valid
                        ? 'border-brand-green focus:border-brand-green'
                        : charCount > 0
                          ? 'border-red-600 focus:border-red-500'
                          : 'border-brand-accent focus:border-brand-blue'
                      }`}
        />
        {/* Live status icon */}
        <div className="absolute right-4 top-1/2 -translate-y-1/2">
          {charCount === 0 && null}
          {charCount > 0 && !valid && <XCircle className="w-6 h-6 text-red-500" />}
          {valid && <CheckCircle className="w-6 h-6 text-brand-green" />}
        </div>
      </div>

      {/* Character counter */}
      <div className="flex justify-between text-xs text-gray-500 -mt-3 px-1">
        <span>{charCount} / 17 characters</span>
        {remaining > 0 && charCount > 0 && (
          <span className="text-yellow-500">{remaining} more needed</span>
        )}
        {valid && <span className="text-brand-green font-semibold">Valid VIN ✓</span>}
      </div>

      {/* Validation error */}
      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded-xl px-4 py-3">
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={!valid}
        className="btn-success disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <CheckCircle className="w-6 h-6" />
        Confirm VIN
      </button>
    </form>
  )
}
