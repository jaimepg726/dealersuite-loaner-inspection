/**
 * DealerSuite — Camera OCR Scanner
 * Captures a still frame from the camera and runs Tesseract.js OCR
 * to extract a VIN from dashboard stickers, door jamb labels, etc.
 *
 * Tesseract is loaded lazily so it doesn't bloat the initial bundle.
 * The WASM worker is cached after first load.
 */

import { useRef, useState, useCallback, useEffect } from 'react'
import { Camera, RefreshCw, Scan, CameraOff } from 'lucide-react'
import { extractVINFromText } from '../../hooks/useVINValidation'

export default function OCRScanner({ onDetected, active = true }) {
  const videoRef    = useRef(null)
  const canvasRef   = useRef(null)
  const streamRef   = useRef(null)
  const workerRef   = useRef(null)

  const [phase,      setPhase]      = useState('idle')   // idle | streaming | capturing | processing | error
  const [progress,   setProgress]   = useState(0)
  const [camError,   setCamError]   = useState(null)
  const [lastResult, setLastResult] = useState(null)

  // ── Start camera stream ─────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    setCamError(null)
    setPhase('streaming')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' }, // rear camera
          width:  { ideal: 1920 },
          height: { ideal: 1080 },
        },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
    } catch (err) {
      setCamError(
        err.name === 'NotAllowedError'
          ? 'Camera permission denied. Use manual entry instead.'
          : 'Camera not available. Try manual entry.'
      )
      setPhase('error')
    }
  }, [])

  // ── Stop camera stream ──────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setPhase('idle')
  }, [])

  useEffect(() => {
    if (active) startCamera()
    else stopCamera()
    return () => stopCamera()
  }, [active, startCamera, stopCamera])

  // ── Capture frame + run OCR ─────────────────────────────────────────────
  const captureAndRecognise = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return
    setPhase('capturing')
    setProgress(0)
    setLastResult(null)

    // Draw current video frame to canvas
    const video  = videoRef.current
    const canvas = canvasRef.current
    canvas.width  = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)

    setPhase('processing')

    try {
      // Lazy-load Tesseract to keep initial bundle small
      const Tesseract = (await import('tesseract.js')).default

      if (!workerRef.current) {
        workerRef.current = await Tesseract.createWorker('eng', 1, {
          logger: (m) => {
            if (m.status === 'recognizing text') {
              setProgress(Math.round((m.progress || 0) * 100))
            }
          },
          // Restrict to characters valid in a VIN
          tessedit_char_whitelist: 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789 ',
        })
      }

      const { data } = await workerRef.current.recognize(canvas)
      const vin = extractVINFromText(data.text)

      if (vin) {
        if (navigator.vibrate) navigator.vibrate(100)
        setLastResult({ success: true, text: vin })
        onDetected(vin)
      } else {
        setLastResult({ success: false, text: data.text?.trim().slice(0, 60) || '(nothing found)' })
        setPhase('streaming') // ready to try again
      }
    } catch (err) {
      console.error('OCR error:', err)
      setLastResult({ success: false, text: 'OCR failed. Try again or use manual entry.' })
      setPhase('streaming')
    }
  }, [onDetected])

  // ── Cleanup Tesseract worker on unmount ─────────────────────────────────
  useEffect(() => {
    return () => {
      workerRef.current?.terminate()
    }
  }, [])

  // ── Render ───────────────────────────────────────────────────────────────
  if (camError) {
    return (
      <div className="flex flex-col items-center gap-5 p-8 text-center">
        <CameraOff className="w-16 h-16 text-brand-red" />
        <p className="text-red-400 text-sm">{camError}</p>
        <button onClick={startCamera} className="btn-ghost max-w-xs">
          <RefreshCw className="w-5 h-5" /> Retry
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4 w-full">

      {/* Video / capture preview */}
      <div className="relative w-full max-w-sm aspect-video rounded-2xl overflow-hidden bg-black">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          playsInline
          muted
        />

        {/* Instruction overlay */}
        {phase === 'streaming' && (
          <div className="absolute bottom-3 inset-x-0 flex justify-center pointer-events-none">
            <span className="bg-black/70 text-white text-xs font-semibold px-3 py-1 rounded-full">
              Point at VIN label, then tap Scan
            </span>
          </div>
        )}

        {/* Processing overlay */}
        {phase === 'processing' && (
          <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-3">
            <Scan className="w-12 h-12 text-brand-blue animate-pulse" />
            <p className="text-white text-sm font-semibold">Reading text… {progress}%</p>
            <div className="w-40 h-2 bg-brand-accent rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-blue transition-all duration-200 rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Capture flash */}
        {phase === 'capturing' && (
          <div className="absolute inset-0 bg-white opacity-60 animate-ping pointer-events-none" />
        )}
      </div>

      {/* Hidden canvas used for frame capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Result feedback */}
      {lastResult && !lastResult.success && (
        <div className="w-full max-w-sm bg-yellow-900/50 border border-yellow-700 rounded-xl px-4 py-3">
          <p className="text-yellow-300 text-xs font-medium">
            No VIN found in: <span className="opacity-70">"{lastResult.text}"</span>
          </p>
          <p className="text-yellow-400 text-xs mt-1">Try getting closer or use manual entry.</p>
        </div>
      )}

      {/* Scan button */}
      <button
        onClick={captureAndRecognise}
        disabled={phase === 'processing' || phase === 'capturing' || phase === 'idle'}
        className="btn-primary max-w-sm disabled:opacity-40"
      >
        <Camera className="w-6 h-6" />
        {phase === 'processing' ? `Scanning… ${progress}%` : 'Scan Now'}
      </button>
    </div>
  )
}
