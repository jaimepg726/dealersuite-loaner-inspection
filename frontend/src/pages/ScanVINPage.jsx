/**
 * DealerSuite - Vehicle Identification Page
 * Loaner number always visible at top; VIN scan methods below.
 *
 * Flow:
 *   1. Porter enters loaner # (fastest path) OR uses VIN scan below
 *   2. Vehicle found -> navigate to type selection
 *   3. Camera opens immediately (no confirmation screens)
 */

import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ScanBarcode, Hash, Camera, Keyboard, Loader2 } from 'lucide-react'

import PageHeader          from '../components/ui/PageHeader'
import LoadingScreen       from '../components/ui/LoadingScreen'
import BarcodeScanner      from '../components/inspection/BarcodeScanner'
import OCRScanner          from '../components/inspection/OCRScanner'
import ManualVINEntry      from '../components/inspection/ManualVINEntry'
import useVehicleLookup    from '../hooks/useVehicleLookup'

const VIN_METHODS = [
  { id: 'barcode', label: 'Barcode', Icon: ScanBarcode },
  { id: 'ocr',     label: 'Camera',  Icon: Camera      },
  { id: 'manual',  label: 'Manual',  Icon: Keyboard    },
]

export default function ScanVINPage() {
  const navigate  = useNavigate()
  const [vinMethod,   setVinMethod]   = useState('barcode')
  const [scanned,     setScanned]     = useState(null)
  const [loanerInput, setLoanerInput] = useState('')
  const [loanerLoading, setLoanerLoading] = useState(false)

  const { loading, error, lookup, lookupByLoaner, reset } = useVehicleLookup()

  function openCamera(vehicle) {
    navigate('/select-type', { state: { vehicle } })
  }

  // Called by any VIN scanner when a VIN is detected
  const handleVINDetected = useCallback(async (vin) => {
    setScanned(vin)
    const vehicle = await lookup(vin)
    if (vehicle) openCamera(vehicle)
  }, [lookup]) // eslint-disable-line react-hooks/exhaustive-deps

  // Called when porter submits a loaner number
  async function lookupVehicleByLoanerNumber(e) {
    e.preventDefault()
    const val = loanerInput.trim()
    if (!val) return
    setScanned(val)
    setLoanerLoading(true)
    try {
      const vehicle = await lookupByLoaner(val)
      if (vehicle) openCamera(vehicle)
    } finally {
      setLoanerLoading(false)
    }
  }

  // Full-page loading only for VIN scanner lookups (barcode/OCR/manual)
  if (loading && !loanerLoading) return <LoadingScreen message={`Looking up ${scanned}…`} />

  return (
    <div className="min-h-screen bg-brand-dark flex flex-col">
      <PageHeader
        title="New Inspection"
        subtitle="Identify vehicle to begin"
        showBack
      />

      <main className="flex-1 flex flex-col px-5 pb-10 gap-5">

        {/* Error banner */}
        {error && (
          <div className="bg-red-900/50 border border-red-700 rounded-2xl px-5 py-4">
            <p className="text-red-300 font-semibold text-sm">{error}</p>
            <button
              onClick={() => { setScanned(null); reset() }}
              className="mt-3 text-red-400 underline text-sm"
            >
              Try again
            </button>
          </div>
        )}

        {/* ── Loaner Number — always visible at top ────────────────────── */}
        <div className="flex flex-col gap-3">
          <div>
            <h3 className="text-brand-white font-extrabold text-base flex items-center gap-2">
              <Hash className="w-5 h-5 text-brand-blue" />
              Loaner Number
            </h3>
            <p className="text-gray-500 text-xs mt-0.5">
              Enter the number printed on the key tag or dashboard sticker
            </p>
          </div>
          <form onSubmit={lookupVehicleByLoanerNumber} className="flex flex-col gap-3">
            <input
              type="text"
              value={loanerInput}
              onChange={(e) => setLoanerInput(e.target.value)}
              placeholder="Enter Loaner #"
              disabled={loanerLoading}
              className="w-full bg-brand-mid border border-brand-accent rounded-2xl
                         px-4 py-4 text-brand-white text-xl font-bold text-center
                         placeholder:text-gray-600 focus:outline-none focus:border-brand-blue
                         disabled:opacity-60 transition-colors"
              autoFocus
            />
            <button
              type="submit"
              disabled={!loanerInput.trim() || loanerLoading}
              className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loanerLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Hash className="w-5 h-5" />
              )}
              {loanerLoading ? 'Looking up…' : 'Look Up Loaner'}
            </button>
          </form>
        </div>

        {/* ── Divider ───────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-brand-accent" />
          <span className="text-gray-600 text-xs font-semibold tracking-widest uppercase">
            or scan VIN
          </span>
          <div className="flex-1 h-px bg-brand-accent" />
        </div>

        {/* ── VIN method sub-tabs ───────────────────────────────────────── */}
        <div className="flex gap-2">
          {VIN_METHODS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => { setVinMethod(id); setScanned(null); reset() }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl
                           text-xs font-bold transition-colors border
                           ${vinMethod === id
                             ? 'bg-brand-blue/20 border-brand-blue text-brand-blue'
                             : 'border-brand-accent text-gray-500'}`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {vinMethod === 'barcode' && (
          <div className="flex flex-col gap-3">
            <p className="text-gray-400 text-sm text-center">
              Point rear camera at the VIN barcode on the windshield or door jamb
            </p>
            <BarcodeScanner
              onDetected={handleVINDetected}
              active={vinMethod === 'barcode' && !loanerLoading}
            />
          </div>
        )}

        {vinMethod === 'ocr' && (
          <div className="flex flex-col gap-3">
            <p className="text-gray-400 text-sm text-center">
              Point at the VIN number on the dashboard or door sticker, then tap Scan
            </p>
            <OCRScanner
              onDetected={handleVINDetected}
              active={vinMethod === 'ocr' && !loanerLoading}
            />
          </div>
        )}

        {vinMethod === 'manual' && (
          <ManualVINEntry onDetected={handleVINDetected} />
        )}

      </main>
    </div>
  )
}
