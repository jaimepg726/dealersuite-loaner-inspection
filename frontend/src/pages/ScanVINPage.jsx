/**
 * DealerSuite - Vehicle Identification Page
 * Two methods: VIN Scan (barcode / OCR / manual) | Loaner Number
 *
 * Flow:
 *   1. Porter picks identification method via tab
 *   2. Vehicle found -> inspection created automatically
 *   3. Camera opens immediately (no confirmation screens)
 */

import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ScanBarcode, Hash, Camera, Keyboard } from 'lucide-react'

import PageHeader          from '../components/ui/PageHeader'
import LoadingScreen       from '../components/ui/LoadingScreen'
import BarcodeScanner      from '../components/inspection/BarcodeScanner'
import OCRScanner          from '../components/inspection/OCRScanner'
import ManualVINEntry      from '../components/inspection/ManualVINEntry'
import useVehicleLookup    from '../hooks/useVehicleLookup'

const MAIN_TABS = [
  { id: 'vin',    label: 'VIN Scan',      Icon: ScanBarcode },
  { id: 'loaner', label: 'Loaner Number', Icon: Hash        },
]

const VIN_METHODS = [
  { id: 'barcode', label: 'Barcode', Icon: ScanBarcode },
  { id: 'ocr',     label: 'Camera',  Icon: Camera      },
  { id: 'manual',  label: 'Manual',  Icon: Keyboard    },
]

export default function ScanVINPage() {
  const navigate  = useNavigate()
  const [tab,         setTab]         = useState('vin')
  const [vinMethod,   setVinMethod]   = useState('barcode')
  const [scanned,     setScanned]     = useState(null)
  const [loanerInput, setLoanerInput] = useState('')

  const { loading, error, lookup, lookupByLoaner, reset } = useVehicleLookup()

  // Navigate directly to camera - no confirm, no type selection
  function openCamera(vehicle) {
    navigate(`/inspect/checkout/${vehicle.id}`, { state: { vehicle } })
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
    const vehicle = await lookupByLoaner(val)
    if (vehicle) openCamera(vehicle)
  }

  // Reset on tab change
  function handleTabChange(id) {
    setTab(id)
    setScanned(null)
    reset()
  }

  if (loading) return <LoadingScreen message={`Looking up ${scanned}…`} />

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

        {/* Main tabs: VIN Scan | Loaner Number */}
        <div className="flex bg-brand-mid rounded-2xl p-1 border border-brand-accent">
          {MAIN_TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => handleTabChange(id)}
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

        {/* VIN Scan tab */}
        {tab === 'vin' && (
          <>
            {/* VIN method sub-tabs */}
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
                  active={tab === 'vin' && vinMethod === 'barcode'}
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
                  active={tab === 'vin' && vinMethod === 'ocr'}
                />
              </div>
            )}

            {vinMethod === 'manual' && (
              <ManualVINEntry onDetected={handleVINDetected} />
            )}
          </>
        )}

        {/* Loaner Number tab */}
        {tab === 'loaner' && (
          <div className="flex flex-col gap-3">
            <p className="text-gray-400 text-sm text-center">
              Enter the loaner number printed on the key tag or dashboard sticker
            </p>
            <form onSubmit={lookupVehicleByLoanerNumber} className="flex flex-col gap-3">
              <input
                type="text"
                value={loanerInput}
                onChange={(e) => setLoanerInput(e.target.value)}
                placeholder="Enter Loaner #"
                className="w-full bg-brand-mid border border-brand-accent rounded-2xl
                           px-4 py-4 text-brand-white text-lg font-bold text-center
                           placeholder:text-gray-600 focus:outline-none focus:border-brand-blue"
                autoFocus
              />
              <button
                type="submit"
                disabled={!loanerInput.trim()}
                className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Hash className="w-5 h-5" />
                Look Up Loaner
              </button>
            </form>
          </div>
        )}

      </main>
    </div>
  )
}
