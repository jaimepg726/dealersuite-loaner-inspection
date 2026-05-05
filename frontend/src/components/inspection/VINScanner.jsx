/**
 * DealerSuite — Unified VIN Scanner
 * Tries barcode detection first (ZXing, continuous), then OCR on demand.
 * Only one scanner is mounted at a time so there is no camera conflict.
 *
 * Props:
 *   onDetected(vin) — called with a validated 17-char VIN
 *   active          — pause scanning when false (e.g. during lookup)
 */

import { useState } from 'react'
import { ScanLine, Camera } from 'lucide-react'
import BarcodeScanner from './BarcodeScanner'
import OCRScanner    from './OCRScanner'

export default function VINScanner({ onDetected, active }) {
  const [mode, setMode] = useState('barcode')

  return (
    <div className="flex flex-col gap-3 w-full">

      {mode === 'barcode'
        ? <BarcodeScanner onDetected={onDetected} active={active} />
        : <OCRScanner     onDetected={onDetected} active={active} />
      }

      {/* Mode toggle — sits below whichever scanner is active */}
      <button
        type="button"
        onClick={() => setMode(m => m === 'barcode' ? 'ocr' : 'barcode')}
        className="flex items-center justify-center gap-1.5 text-gray-500
                   text-xs underline text-center py-1 w-full"
      >
        {mode === 'barcode'
          ? <><Camera  className="w-3.5 h-3.5" /> Can't read barcode? Try camera text scan</>
          : <><ScanLine className="w-3.5 h-3.5" /> Switch back to barcode scan</>
        }
      </button>

    </div>
  )
}
