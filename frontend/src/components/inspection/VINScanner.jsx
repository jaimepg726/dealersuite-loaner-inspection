/**
 * DealerSuite — Photo-Based VIN Scanner
 *
 * Replaces fragile live barcode/OCR scanning with a one-shot photo flow:
 *   1. Opens camera stream (rear preferred; loose fallback for phones)
 *   2. Porter fits VIN label inside guide box and taps Capture
 *   3. Camera stream stops immediately after capture — no lingering streams
 *   4. ZXing barcode decode attempted first on the captured frame
 *   5. Tesseract OCR attempted as fallback if barcode finds nothing
 *   6. Valid VIN → onDetected(vin) (parent shows confirmation; no auto-lookup)
 *   7. No VIN found → inline retry UI with Retake / Enter Manually
 *
 * Props:
 *   onDetected(vin)  called with a validated 17-char VIN
 *   onManual()       called when porter taps "Enter Manually"
 *   active           stop camera when false (e.g. inactive tab or during lookup)
 */

import { useRef, useState, useCallback, useEffect } from 'react'
import { Camera, CameraOff, RefreshCw, ScanLine, Pencil } from 'lucide-react'
import { validateVIN, extractVINFromText, normalizeOCRText } from '../../hooks/useVINValidation'

// ── Camera helpers ────────────────────────────────────────────────────────────

async function acquireStream() {
  // Prefer rear camera at reasonable resolution.
  // Many phones reject specific facingMode constraints — fall back to bare
  // { video: true } so we always get *some* camera rather than failing hard.
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width:  { ideal: 1280 },
        height: { ideal: 720 },
      },
    })
  } catch {
    return await navigator.mediaDevices.getUserMedia({ video: true })
  }
}

function releaseStream(streamRef) {
  streamRef.current?.getTracks().forEach(t => t.stop())
  streamRef.current = null
}

// ── Barcode decode from a captured canvas ─────────────────────────────────────
// ZXing's BrowserCodeReader.decodeFromImageElement works on a still HTMLImageElement.
// We convert canvas → data URL → img element, then pass to ZXing.

async function tryBarcodeFromCanvas(canvas) {
  try {
    const { BrowserMultiFormatReader, BarcodeFormat, DecodeHintType } =
      await import('@zxing/library')

    const hints = new Map()
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.CODE_39,
      BarcodeFormat.CODE_128,
      BarcodeFormat.PDF_417,
    ])
    hints.set(DecodeHintType.TRY_HARDER, true)

    const reader  = new BrowserMultiFormatReader(hints)
    const dataUrl = canvas.toDataURL()
    const img     = await new Promise((resolve, reject) => {
      const el    = new Image()
      el.onload   = () => resolve(el)
      el.onerror  = reject
      el.src      = dataUrl
    })

    const result        = await reader.decodeFromImageElement(img)
    const { valid, vin } = validateVIN(result.getText())
    return valid ? vin : null
  } catch {
    // NotFoundException fires when no barcode is found — normal, not an error
    return null
  }
}

// ── OCR decode from a captured canvas ────────────────────────────────────────

async function tryOCRFromCanvas(canvas, onProgress) {
  let worker
  try {
    const Tesseract = (await import('tesseract.js')).default
    worker = await Tesseract.createWorker('eng', 1, {
      logger: m => {
        if (m.status === 'recognizing text') onProgress(Math.round((m.progress || 0) * 100))
      },
      // Restrict recognised characters to the VIN-legal set
      tessedit_char_whitelist: 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789 ',
    })
    const { data }   = await worker.recognize(canvas)
    // Conservative normalization: O→0, I→1 before extraction
    const normalized = normalizeOCRText(data.text)
    return extractVINFromText(normalized)
  } catch {
    return null
  } finally {
    await worker?.terminate().catch(() => {})
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function VINScanner({ onDetected, onManual, active }) {
  const videoRef  = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const abortRef  = useRef(false)  // set true when active → false mid-analysis

  // phase: 'idle' | 'starting' | 'ready' | 'analyzing' | 'failed' | 'error'
  const [phase,       setPhase]       = useState('idle')
  const [camError,    setCamError]    = useState(null)
  const [progress,    setProgress]    = useState(0)
  const [analyzeStep, setAnalyzeStep] = useState('')   // 'barcode' | 'ocr'
  const [preview,     setPreview]     = useState(null) // data URL shown during/after analysis

  // ── Start camera ─────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    setCamError(null)
    setPreview(null)
    setPhase('starting')
    try {
      const stream = await acquireStream()
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setPhase('ready')
    } catch (err) {
      const msg = err.name === 'NotAllowedError'
        ? 'Camera permission denied. Please allow camera access in your browser settings.'
        : 'Camera is not available on this device.'
      setCamError(msg)
      setPhase('error')
    }
  }, [])

  // ── Stop camera ──────────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    releaseStream(streamRef)
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  // ── Lifecycle: start on mount/activation, stop on deactivation ───────────
  useEffect(() => {
    if (active) {
      abortRef.current = false
      startCamera()
    } else {
      abortRef.current = true
      stopCamera()
      setPhase('idle')
    }
    return () => {
      abortRef.current = true
      stopCamera()
    }
  }, [active]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Capture one frame and analyse it ─────────────────────────────────────
  const capture = useCallback(async () => {
    if (phase !== 'ready' || !videoRef.current || !canvasRef.current) return

    const video  = videoRef.current
    const canvas = canvasRef.current
    canvas.width  = video.videoWidth  || 1280
    canvas.height = video.videoHeight || 720
    canvas.getContext('2d').drawImage(video, 0, 0)

    // Camera no longer needed — release immediately
    const snap = canvas.toDataURL('image/jpeg', 0.85)
    setPreview(snap)
    stopCamera()
    setPhase('analyzing')
    setProgress(0)
    abortRef.current = false

    // 1 — try barcode (ZXing, Code 39 / Code 128 / PDF417)
    setAnalyzeStep('barcode')
    const barcodeVIN = await tryBarcodeFromCanvas(canvas)
    if (abortRef.current) return
    if (barcodeVIN) {
      if (navigator.vibrate) navigator.vibrate(100)
      onDetected(barcodeVIN)
      return
    }

    // 2 — OCR fallback (Tesseract)
    setAnalyzeStep('ocr')
    const ocrVIN = await tryOCRFromCanvas(canvas, setProgress)
    if (abortRef.current) return
    if (ocrVIN) {
      if (navigator.vibrate) navigator.vibrate(100)
      onDetected(ocrVIN)
      return
    }

    // Nothing found
    setPhase('failed')
  }, [phase, stopCamera, onDetected])

  // ── Retake: restart camera from scratch ──────────────────────────────────
  const retake = useCallback(() => {
    abortRef.current = false
    startCamera()
  }, [startCamera])

  // ── Render ────────────────────────────────────────────────────────────────

  if (phase === 'error' || camError) {
    return (
      <div className="flex flex-col items-center gap-5 p-6 text-center">
        <CameraOff className="w-14 h-14 text-red-400" />
        <p className="text-red-400 text-sm font-medium">{camError}</p>
        <div className="flex flex-col gap-2 w-full max-w-xs">
          <button onClick={startCamera} className="btn-ghost gap-2">
            <RefreshCw className="w-4 h-4" />
            Try Camera Again
          </button>
          {onManual && (
            <button onClick={onManual} className="btn-ghost gap-2">
              <Pencil className="w-4 h-4" />
              Enter Manually
            </button>
          )}
        </div>
      </div>
    )
  }

  if (phase === 'starting' || phase === 'idle') {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-10">
        <div className="w-10 h-10 border-4 border-brand-blue border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-400 text-sm">Opening camera…</p>
      </div>
    )
  }

  if (phase === 'analyzing') {
    return (
      <div className="flex flex-col items-center gap-4 w-full">
        <div className="relative w-full max-w-sm rounded-2xl overflow-hidden bg-black aspect-[4/3]">
          {preview && (
            <img src={preview} alt="Captured VIN label" className="w-full h-full object-cover" />
          )}
          <div className="absolute inset-0 bg-black/55 flex flex-col items-center justify-center gap-3">
            <ScanLine className="w-10 h-10 text-brand-blue animate-pulse" />
            <p className="text-white text-sm font-semibold">
              {analyzeStep === 'barcode' ? 'Reading barcode…' : `Reading text… ${progress}%`}
            </p>
            {analyzeStep === 'ocr' && (
              <div className="w-36 h-1.5 bg-brand-accent rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-blue transition-all duration-200 rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'failed') {
    return (
      <div className="flex flex-col items-center gap-4 w-full">
        {preview && (
          <div className="w-full max-w-sm rounded-2xl overflow-hidden bg-black aspect-[4/3]">
            <img src={preview} alt="Captured VIN label" className="w-full h-full object-cover opacity-50" />
          </div>
        )}
        <div className="w-full max-w-sm bg-yellow-900/50 border border-yellow-700 rounded-xl px-4 py-3 text-center">
          <p className="text-yellow-300 text-sm font-semibold">Could not read VIN from this photo</p>
          <p className="text-yellow-400 text-xs mt-1">
            Try better lighting, move closer, or use manual entry.
          </p>
        </div>
        <div className="flex gap-3 w-full max-w-sm">
          <button onClick={retake} className="btn-ghost flex-1 gap-2">
            <Camera className="w-4 h-4" />
            Retake Photo
          </button>
          {onManual && (
            <button onClick={onManual} className="btn-ghost flex-1 gap-2">
              <Pencil className="w-4 h-4" />
              Enter Manually
            </button>
          )}
        </div>
      </div>
    )
  }

  // phase === 'ready' — live viewfinder
  return (
    <div className="flex flex-col items-center gap-4 w-full">

      {/* Viewfinder with door-jamb guide box */}
      <div className="relative w-full max-w-sm aspect-[4/3] rounded-2xl overflow-hidden bg-black">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          playsInline
          muted
          autoPlay
        />

        {/* Corner-bracket guide box for VIN label */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative w-4/5 aspect-[5/2]">
            <span className="absolute top-0 left-0  w-7 h-7 border-t-4 border-l-4 border-brand-blue rounded-tl-lg" />
            <span className="absolute top-0 right-0 w-7 h-7 border-t-4 border-r-4 border-brand-blue rounded-tr-lg" />
            <span className="absolute bottom-0 left-0  w-7 h-7 border-b-4 border-l-4 border-brand-blue rounded-bl-lg" />
            <span className="absolute bottom-0 right-0 w-7 h-7 border-b-4 border-r-4 border-brand-blue rounded-br-lg" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="bg-black/65 text-brand-blue text-xs font-bold px-3 py-1 rounded-full">
                VIN label here
              </span>
            </div>
          </div>
        </div>

        {/* Top instruction strip */}
        <div className="absolute top-3 inset-x-0 flex justify-center pointer-events-none">
          <span className="bg-black/70 text-white text-xs font-semibold px-3 py-1 rounded-full">
            Fit VIN label inside the box
          </span>
        </div>
      </div>

      {/* Hidden canvas used for frame capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Capture button */}
      <button
        onClick={capture}
        disabled={phase !== 'ready'}
        className="btn-primary w-full max-w-sm disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Camera className="w-5 h-5" />
        Capture VIN Label
      </button>

    </div>
  )
}
