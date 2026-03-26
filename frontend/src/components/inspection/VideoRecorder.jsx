/**
 * DealerSuite — VideoRecorder
 *
 * Full-screen camera UI for the walkround video inspection.
 *
 * States:
 *   loading   → camera starting
 *   ready     → live preview, waiting for porter to tap START
 *   recording → walkround overlay + step timers + PHOTO + STOP
 *   preview   → video recorded; can re-record or continue
 *   error     → camera permission denied or device error
 *
 * Walkround overlay:
 *   9 guided steps with individual countdown timers. Auto-advances.
 *   Porter sees exactly where to point the camera at all times.
 *
 * Minimum recording: 60 seconds. Stop Recording is disabled until then.
 */

import { useState, useEffect, useRef } from 'react'
import {
  Video, Square, Camera, RefreshCw, CheckCircle, AlertCircle, Loader,
} from 'lucide-react'
import useCamera from '../../hooks/useCamera'

// ── Walkround steps ────────────────────────────────────────────────────────
const WALKROUND_STEPS = [
  { label: 'Driver Front Wheel',    hint: 'Get close — show full wheel face',    duration: 8 },
  { label: 'Driver Side',           hint: 'Hold level at door handle height',    duration: 8 },
  { label: 'Driver Rear Wheel',     hint: 'Get close — show full wheel face',    duration: 6 },
  { label: 'Rear Bumper',           hint: 'Full width — stay level',             duration: 6 },
  { label: 'Passenger Rear Wheel',  hint: 'Get close — show full wheel face',    duration: 6 },
  { label: 'Passenger Side',        hint: 'Level sweep — front to back',         duration: 8 },
  { label: 'Passenger Front Wheel', hint: 'Get close — show full wheel face',    duration: 6 },
  { label: 'Front Bumper',          hint: 'Step back — capture full width',      duration: 6 },
  { label: 'Windshield & Hood',     hint: 'Step back — get full glass and hood', duration: 8 },
]

const MIN_RECORD_SECONDS = 60

export default function VideoRecorder({ onComplete }) {
  const cam = useCamera()

  const [phase,          setPhase]          = useState('loading')
  const [capturedPhotos, setCapturedPhotos] = useState([])
  const [videoBlob,      setVideoBlob]      = useState(null)
  const [photoFlash,     setPhotoFlash]     = useState(false)
  const [continuing,     setContinuing]     = useState(false)

  const [stepIndex,    setStepIndex]    = useState(0)
  const [stepSecsLeft, setStepSecsLeft] = useState(WALKROUND_STEPS[0].duration)
  const [totalSecs,    setTotalSecs]    = useState(0)
  const [canStop,      setCanStop]      = useState(false)

  const stepTimerRef     = useRef(null)
  const totalTimerRef    = useRef(null)
  const stepIndexRef     = useRef(0)
  const continueFiredRef = useRef(false)

  useEffect(() => {
    cam.startCamera()
      .then(() => setPhase('ready'))
      .catch(() => setPhase('error'))
    return () => {
      cam.stopCamera()
      clearInterval(stepTimerRef.current)
      clearInterval(totalTimerRef.current)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function startOverlayTimers() {
    stepIndexRef.current = 0
    setStepIndex(0)
    setStepSecsLeft(WALKROUND_STEPS[0].duration)
    setTotalSecs(0)
    setCanStop(false)

    totalTimerRef.current = setInterval(() => {
      setTotalSecs(prev => {
        const next = prev + 1
        if (next >= MIN_RECORD_SECONDS) setCanStop(true)
        return next
      })
    }, 1000)

    let secsIntoStep = 0
    stepTimerRef.current = setInterval(() => {
      secsIntoStep++
      const step = WALKROUND_STEPS[stepIndexRef.current]
      const secsLeft = step.duration - secsIntoStep
      if (secsLeft <= 0) {
        const next = stepIndexRef.current + 1
        if (next < WALKROUND_STEPS.length) {
          stepIndexRef.current = next
          setStepIndex(next)
          setStepSecsLeft(WALKROUND_STEPS[next].duration)
          secsIntoStep = 0
        } else {
          setStepSecsLeft(0)
          clearInterval(stepTimerRef.current)
        }
      } else {
        setStepSecsLeft(secsLeft)
      }
    }, 1000)
  }

  function stopOverlayTimers() {
    clearInterval(stepTimerRef.current)
    clearInterval(totalTimerRef.current)
  }

  function handleStartRecording() {
    cam.startRecording()
    setCapturedPhotos([])
    setPhase('recording')
    startOverlayTimers()
  }

  async function handleCapturePhoto() {
    try {
      const blob = await cam.capturePhoto()
      setCapturedPhotos(prev => [...prev, blob])
      setPhotoFlash(true)
      setTimeout(() => setPhotoFlash(false), 150)
    } catch (err) { console.error('Photo capture failed:', err) }
  }

  async function handleStopRecording() {
    stopOverlayTimers()
    try {
      const blob = await cam.stopRecording()
      setVideoBlob(blob)
      setPhase('preview')
    } catch (err) { console.error('Stop recording failed:', err) }
  }

  function handleReRecord() {
    setVideoBlob(null)
    setCapturedPhotos([])
    setTotalSecs(0)
    setCanStop(false)
    setStepIndex(0)
    setStepSecsLeft(WALKROUND_STEPS[0].duration)
    continueFiredRef.current = false
    setPhase('ready')
  }

  function handleContinue() {
    if (continueFiredRef.current) { console.warn('Duplicate Continue prevented'); return }
    continueFiredRef.current = true
    setContinuing(true)
    cam.stopCamera()
    onComplete(videoBlob, capturedPhotos)
  }

  function handleRetry() {
    setPhase('loading')
    cam.startCamera().then(() => setPhase('ready')).catch(() => setPhase('error'))
  }

  const currentStep  = WALKROUND_STEPS[stepIndex] ?? WALKROUND_STEPS[WALKROUND_STEPS.length - 1]
  const stepProgress = stepSecsLeft === 0 ? 1 : 1 - (stepSecsLeft / currentStep.duration)
  const isLastStep   = stepIndex >= WALKROUND_STEPS.length - 1
  const allDone      = isLastStep && stepSecsLeft === 0

  return (
    <div className="flex flex-col gap-4">
      <div className="relative w-full bg-black rounded-2xl overflow-hidden" style={{ aspectRatio: '16/9' }}>
        <video ref={cam.videoRef} autoPlay muted playsInline
          className={`w-full h-full object-cover ${phase === 'preview' ? 'opacity-30' : ''}`} />

        {phase === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70">
            <Loader className="w-10 h-10 text-brand-blue animate-spin" />
            <p className="text-white text-sm font-semibold">Starting camera…</p>
          </div>
        )}
        {phase === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 px-6 text-center">
            <AlertCircle className="w-10 h-10 text-red-400" />
            <p className="text-white font-bold">Camera unavailable</p>
            <p className="text-gray-400 text-sm">{cam.cameraError}</p>
            <button onClick={handleRetry} className="btn-ghost text-sm mt-2 w-auto px-6"><RefreshCw className="w-4 h-4" /> Try Again</button>
          </div>
        )}
        {phase === 'recording' && (
          <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/60 rounded-full px-3 py-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-white font-mono font-bold text-sm">{cam.formattedTime}</span>
          </div>
        )}
        {phase === 'recording' && capturedPhotos.length > 0 && (
          <div className="absolute top-3 right-3 bg-brand-blue/90 rounded-full px-2 py-1 text-white text-xs font-bold">
            {capturedPhotos.length} 📷
          </div>
        )}
        {phase === 'recording' && (
          <div className="absolute bottom-0 left-0 right-0 px-3 pb-3">
            <div className="bg-black/80 backdrop-blur-sm rounded-xl px-4 py-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1 items-center">
                    {WALKROUND_STEPS.map((_, i) => (
                      <div key={i} className={`rounded-full transition-all duration-300 ${
                        i < stepIndex ? 'w-1.5 h-1.5 bg-green-400'
                        : i === stepIndex ? 'w-2.5 h-2.5 bg-brand-blue'
                        : 'w-1.5 h-1.5 bg-gray-600'
                      }`} />
                    ))}
                  </div>
                  <span className="text-gray-400 text-xs font-semibold">Step {stepIndex + 1}/{WALKROUND_STEPS.length}</span>
                </div>
                <div className={`font-mono font-black text-2xl leading-none ${
                  allDone ? 'text-green-400' : stepSecsLeft <= 3 ? 'text-yellow-400' : 'text-white'
                }`}>
                  {allDone ? '✓' : `${stepSecsLeft}s`}
                </div>
              </div>
              <p className="text-white font-bold text-base leading-tight">📍 {currentStep.label}</p>
              <p className="text-gray-300 text-xs mt-0.5 leading-tight">{currentStep.hint}</p>
              <div className="mt-2 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-1000 ease-linear ${
                  allDone ? 'bg-green-400' : 'bg-brand-blue'
                }`} style={{ width: `${stepProgress * 100}%` }} />
              </div>
            </div>
          </div>
        )}
        {photoFlash && <div className="absolute inset-0 bg-white opacity-70 pointer-events-none" />}
        {phase === 'preview' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50">
            <CheckCircle className="w-12 h-12 text-green-400" />
            <p className="text-white font-bold text-lg">Video Recorded</p>
            {capturedPhotos.length > 0 && <p className="text-gray-300 text-sm">{capturedPhotos.length} photo{capturedPhotos.length !== 1 ? 's' : ''} captured</p>}
          </div>
        )}
      </div>

      {phase === 'ready' && (
        <>
          <button onClick={handleStartRecording} className="btn-danger"><Video className="w-6 h-6" />Start Recording</button>
          <p className="text-gray-500 text-xs text-center">The app will guide you around the vehicle step by step.</p>
        </>
      )}
      {phase === 'recording' && (
        <>
          <div className="flex gap-3">
            <button onClick={handleCapturePhoto} className="flex-1 bg-brand-mid border border-brand-accent text-brand-white font-bold text-base py-4 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-transform">
              <Camera className="w-5 h-5" />Photo
            </button>
            <button onClick={handleStopRecording} disabled={!canStop} className="flex-[2] btn-danger disabled:opacity-40 disabled:pointer-events-none">
              <Square className="w-5 h-5 fill-white" />
              {canStop ? 'Stop Recording' : `Stop (${Math.max(0, MIN_RECORD_SECONDS - totalSecs)}s)`}
            </button>
          </div>
          {!canStop && <p className="text-yellow-500 text-xs text-center font-semibold">⏱ Follow the steps above — Stop unlocks after {MIN_RECORD_SECONDS}s</p>}
        </>
      )}
      {phase === 'preview' && (
        <div className="flex gap-3">
          <button onClick={handleReRecord} className="flex-1 btn-ghost"><RefreshCw className="w-5 h-5" />Re-record</button>
          <button onClick={handleContinue} disabled={continuing} className="flex-[2] btn-success disabled:opacity-50 disabled:pointer-events-none">
            <CheckCircle className="w-5 h-5" />Continue
          </button>
        </div>
      )}
    </div>
  )
}
