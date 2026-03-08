/**
 * DealerSuite — VIN Scan Page
 * Three methods: Barcode (ZXing) | Camera OCR (Tesseract) | Manual Entry
 *
 * Flow:
 *   1. Porter picks scan method via tab
 *   2. VIN detected → backend lookup
 *   3. Vehicle confirm card shown
 *   4. Porter confirms → SelectInspectionTypePage
 */

import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ScanBarcode, Camera, Keyboard } from 'lucide-react'

import PageHeader          from '../components/ui/PageHeader'
import LoadingScreen       from '../components/ui/LoadingScreen'
import BarcodeScanner      from '../components/inspection/BarcodeScanner'
import OCRScanner          from '../components/inspection/OCRScanner'
import ManualVINEntry      from '../components/inspection/ManualVINEntry'
import VehicleConfirmCard  from '../components/inspection/VehicleConfirmCard'
import useVehicleLookup    from '../hooks/useVehicleLookup'

const TABS = [
  { id: 'barcode', label: 'Barcode',  Icon: ScanBarcode },
  { id: 'ocr',     label: 'Camera',   Icon: Camera      },
  { id: 'manual',  label: 'Manual',   Icon: Keyboard    },
]

export default function ScanVINPage() {
  const navigate  = useNavigate()
  const [tab,     setTab]     = useState('barcode')
  const [scanned, setScanned] = useState(null)   // VIN string after detection

  const { vehicle, loading, error, lookup, reset } = useVehicleLookup()

  // ── Called by any scanner when a VIN is detected ───────────────────────
  const handleVINDetected = useCallback(async (vin) => {
    setScanned(vin)
    await lookup(vin)
  }, [lookup])

  // ── Porter taps "No, Rescan" ───────────────────────────────────────────
  function handleReject() {
    setScanned(null)
    reset()
  }

  // ── Porter taps "Yes, Continue" ────────────────────────────────────────
  function handleConfirm(v) {
    navigate('/select-type', { state: { vehicle: v } })
  }

  // ── Loading state while API call runs ─────────────────────────────────
  if (loading) return <LoadingScreen message={`Looking up VIN ${scanned}…`} />

  return (
    <div className="min-h-screen bg-brand-dark flex flex-col">
      <PageHeader
        title="Scan VIN"
        subtitle="Point camera at barcode, scan text, or type it in"
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
          <div className="bg-red-900/50 border border-red-700 rounded-2xl px-5 py-4">
            <p className="text-red-300 font-semibold text-sm">{error}</p>
            <button
              onClick={handleReject}
              className="mt-3 text-red-400 underline text-sm"
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
                  onClick={() => { setTab(id); setScanned(null); reset() }}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl
                               text-sm font-bold transition-colors
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

            {/* ── Manual tab ──────────────────────────────────────────── */}
            {tab === 'manual' && (
              <div className="flex flex-col gap-3">
                <ManualVINEntry onDetected={handleVINDetected} />
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
