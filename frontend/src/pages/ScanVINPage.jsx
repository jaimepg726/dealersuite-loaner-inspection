/**
 * DealerSuite — VIN Scan Page
 * Four methods: Barcode (ZXing) | Camera OCR (Tesseract) | Manual VIN | Loaner #
 *
 * Flow:
 *   1. Porter picks scan method via tab
 *   2. VIN / loaner number detected → backend lookup
 *   3. Vehicle confirm card shown
 *   4. Porter confirms → InspectPage (preType) or SelectInspectionTypePage
 *
 * If a VIN is not in the fleet, the porter can opt to continue anyway.
 * A stub vehicle record is created (vehicle_type="other") so the inspection
 * can still be started without altering the schema.
 */

import { useState, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ScanBarcode, Camera, Keyboard, Hash } from 'lucide-react'

import PageHeader          from '../components/ui/PageHeader'
import LoadingScreen       from '../components/ui/LoadingScreen'
import BarcodeScanner      from '../components/inspection/BarcodeScanner'
import OCRScanner          from '../components/inspection/OCRScanner'
import ManualVINEntry      from '../components/inspection/ManualVINEntry'
import VehicleConfirmCard  from '../components/inspection/VehicleConfirmCard'
import useVehicleLookup    from '../hooks/useVehicleLookup'
import api                 from '../utils/api'

const TABS = [
  { id: 'barcode',  label: 'Barcode',  Icon: ScanBarcode },
  { id: 'ocr',      label: 'Camera',   Icon: Camera      },
  { id: 'manual',   label: 'Manual',   Icon: Keyboard    },
  { id: 'loaner',   label: 'Loaner #', Icon: Hash        },
]

export default function ScanVINPage() {
  const navigate  = useNavigate()
  const location  = useLocation()

  // If PorterHome set a pre-selected inspection type, skip SelectInspectionTypePage
  const preType = location.state?.preType ?? null   // 'checkout' | 'checkin' | null

  const [tab,               setTab]               = useState('barcode')
  const [scanned,           setScanned]           = useState(null)  // VIN string after detection
  const [loanerInput,       setLoanerInput]       = useState('')
  const [loanerLoading,     setLoanerLoading]     = useState(false)
  const [loanerError,       setLoanerError]       = useState(null)
  const [nonFleetVin,       setNonFleetVin]       = useState(null)  // VIN shown for stub creation
  const [stubLoading,       setStubLoading]       = useState(false)

  const { vehicle, loading, error, lookup, reset } = useVehicleLookup()

  // ── Navigate to inspection (skip or go to type selector) ──────────────
  function navigateToInspection(v) {
    if (preType) {
      navigate(`/inspect/${preType}/${v.id}`, { state: { vehicle: v } })
    } else {
      navigate('/select-type', { state: { vehicle: v } })
    }
  }

  // ── Called by any scanner when a VIN is detected ───────────────────────
  const handleVINDetected = useCallback(async (vin) => {
    setScanned(vin)
    setNonFleetVin(null)
    const v = await lookup(vin)
    if (!v) {
      // lookup failed (404 or other) — record the VIN so porter can continue anyway
      setNonFleetVin(vin)
    }
  }, [lookup])

  // ── Loaner # lookup ───────────────────────────────────────────────────
  async function handleLoanerLookup() {
    const input = loanerInput.trim()
    if (!input) return
    setLoanerLoading(true)
    setLoanerError(null)
    setNonFleetVin(null)
    reset()
    try {
      const { data } = await api.get(`/api/loaners/by-number/${encodeURIComponent(input)}`)
      // Treat found vehicle the same as a VIN lookup
      await lookup(data.vin)
    } catch (err) {
      const msg =
        err.response?.status === 404
          ? `Loaner "${input}" not found. Check the number and try again.`
          : err.response?.data?.detail || 'Could not look up loaner number.'
      setLoanerError(msg)
    } finally {
      setLoanerLoading(false)
    }
  }

  // ── "Continue Anyway" for non-fleet VINs ─────────────────────────────
  async function handleContinueNonFleet() {
    if (!nonFleetVin) return
    setStubLoading(true)
    try {
      const { data } = await api.post('/api/vehicles/stub', { vin: nonFleetVin })
      navigateToInspection(data)
    } catch (err) {
      // If stub creation fails, surface the original error
      console.error('Stub vehicle creation failed:', err)
    } finally {
      setStubLoading(false)
    }
  }

  // ── Porter taps "No, Rescan" ───────────────────────────────────────────
  function handleReject() {
    setScanned(null)
    setNonFleetVin(null)
    setLoanerInput('')
    setLoanerError(null)
    reset()
  }

  // ── Porter taps "Yes, Continue" ────────────────────────────────────────
  function handleConfirm(v) {
    navigateToInspection(v)
  }

  // ── Loading state while API call runs ─────────────────────────────────
  if (loading || loanerLoading) {
    return (
      <LoadingScreen
        message={loanerLoading
          ? `Looking up loaner ${loanerInput}…`
          : `Looking up VIN ${scanned}…`
        }
      />
    )
  }

  return (
    <div className="min-h-screen bg-brand-dark flex flex-col">
      <PageHeader
        title={preType === 'checkout' ? 'Loaner Out' : preType === 'checkin' ? 'Loaner Return' : 'Scan VIN'}
        subtitle="Scan barcode, use camera OCR, type VIN, or enter loaner number"
        showBack
      />

      <main className="flex-1 flex flex-col px-5 pb-10 gap-5">

        {/* ── Confirm card (shown after successful lookup) ─────────────── */}
        {vehicle && !loading && (
          <VehicleConfirmCard
            vehicle={vehicle}
            onConfirm={handleConfirm}
            onReject={handleReject}
          />
        )}

        {/* ── Error banner (VIN not found in fleet) ───────────────────── */}
        {error && !vehicle && (
          <div className="bg-red-900/50 border border-red-700 rounded-2xl px-5 py-4 flex flex-col gap-3">
            <p className="text-red-300 font-semibold text-sm">{error}</p>

            {/* Non-fleet VIN: offer to continue anyway */}
            {nonFleetVin && (
              <div className="flex flex-col gap-2">
                <p className="text-gray-400 text-xs">
                  VIN not in loaner fleet. You can still create an inspection — it won't appear in loaner reports.
                </p>
                <button
                  onClick={handleContinueNonFleet}
                  disabled={stubLoading}
                  className="bg-yellow-700/80 border border-yellow-600 text-yellow-100
                             font-bold text-sm py-3 px-4 rounded-xl
                             active:scale-95 transition-transform disabled:opacity-60"
                >
                  {stubLoading ? 'Creating…' : 'Continue Anyway (Non-Fleet Vehicle)'}
                </button>
              </div>
            )}

            <button
              onClick={handleReject}
              className="text-red-400 underline text-sm self-start"
            >
              Try a different VIN
            </button>
          </div>
        )}

        {/* ── Scan interface (hidden once vehicle confirmed) ───────────── */}
        {!vehicle && (
          <>
            {/* Method tabs */}
            <div className="flex bg-brand-mid rounded-2xl p-1 border border-brand-accent">
              {TABS.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  onClick={() => { setTab(id); setScanned(null); setLoanerError(null); setNonFleetVin(null); reset() }}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl
                               text-xs font-bold transition-colors
                               ${tab === id
                                 ? 'bg-brand-blue text-white shadow'
                                 : 'text-gray-400'}`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>

            {/* ── Barcode tab ─────────────────────────────────────────── */}
            {tab === 'barcode' && (
              <div className="flex flex-col gap-3">
                <p className="text-gray-400 text-sm text-center">
                  Point rear camera at the VIN barcode on the windshield or door jamb
                </p>
                <BarcodeScanner
                  onDetected={handleVINDetected}
                  active={tab === 'barcode' && !vehicle}
                />
              </div>
            )}

            {/* ── OCR tab ─────────────────────────────────────────────── */}
            {tab === 'ocr' && (
              <div className="flex flex-col gap-3">
                <p className="text-gray-400 text-sm text-center">
                  Point at the VIN number on the dashboard or door sticker, then tap Scan
                </p>
                <OCRScanner
                  onDetected={handleVINDetected}
                  active={tab === 'ocr' && !vehicle}
                />
              </div>
            )}

            {/* ── Manual VIN tab ──────────────────────────────────────── */}
            {tab === 'manual' && (
              <div className="flex flex-col gap-3">
                <ManualVINEntry onDetected={handleVINDetected} />
              </div>
            )}

            {/* ── Loaner # tab ─────────────────────────────────────────── */}
            {tab === 'loaner' && (
              <div className="flex flex-col gap-4">
                <p className="text-gray-400 text-sm text-center">
                  Enter the loaner number shown on the key tag or dashboard
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={loanerInput}
                    onChange={e => { setLoanerInput(e.target.value); setLoanerError(null) }}
                    onKeyDown={e => e.key === 'Enter' && handleLoanerLookup()}
                    placeholder="e.g. M501 or 501"
                    aria-label="Loaner number"
                    className="flex-1 bg-brand-mid border border-brand-accent rounded-2xl
                               px-4 py-4 text-brand-white text-lg font-bold placeholder-gray-600
                               focus:outline-none focus:border-brand-blue transition-colors uppercase"
                  />
                  <button
                    onClick={handleLoanerLookup}
                    disabled={!loanerInput.trim()}
                    aria-label="Look up loaner"
                    className="bg-brand-blue text-white font-bold px-5 py-4 rounded-2xl
                               active:scale-95 transition-transform disabled:opacity-40 disabled:cursor-not-allowed
                               shrink-0"
                  >
                    Look Up
                  </button>
                </div>
                {loanerError && (
                  <p className="text-red-400 text-sm font-semibold bg-red-900/30
                                border border-red-800 rounded-xl px-4 py-3">
                    {loanerError}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
