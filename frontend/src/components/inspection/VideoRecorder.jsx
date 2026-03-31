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
 *   Step config and timing live in src/config/walkroundSteps.js.
 *
 * Minimum recording: controlled by MIN_RECORD_SECONDS in config.
 */

import { useState, useEffect, useRef } from 'react'
import {
  Video, Square, Camera, RefreshCw, CheckCircle, AlertCircle, Loader,
} from 'lucide-react'
import useCamera from '../../hooks/useCamera'
import { WALKROUND_STEPS, MIN_RECORD_SECONDS } from '../../config/walkroundSteps'
import { t, getLang } from '../../utils/lang'

// Spanish walkround step labels and hints (same order as WALKROUND_STEPS)
const WALKROUND_STEPS_ES = [
  { label: 'Rueda Delantera Conductor',  hint: 'Acérquese — muestre la rueda completa'    },
  { label: 'Lado Conductor',             hint: 'Mantenga nivel a la altura de la manija'  },
  { label: 'Rueda Trasera Conductor',    hint: 'Acérquese — muestre la rueda completa'    },
  { label: 'Parachoques Trasero',        hint: 'Ancho completo — mantenga nivel'          },
  { label: 'Rueda Trasera Pasajero',     hint: 'Acérquese — muestre la rueda completa'    },
  { label: 'Lado Pasajero',              hint: 'Pase lento — de frente a atrás'           },
  { label: 'Rueda Delantera Pasajero',   hint: 'Acérquese — muestre la rueda completa'    },
  { label: 'Parachoques Delantero',      hint: 'Retroceda — capture todo el ancho'        },
  { label: 'Parabrisas y Capó',          hint: 'Retroceda — capture vidrio y capó completo' },
]

// ── Top-down car position indicator ────────────────────────────────────────
// Renders a minimal SVG car outline with a dot showing the current step zone.
// Positions (cx/cy) are defined per step in walkroundSteps.js.
function CarPositionGraphic({ stepIndex }) {
  const step = WALKROUND_STEPS[stepIndex] ?? WALKROUND_STEPS[WALKROUND_STEPS.length - 1]
  return (
    <svg
      viewBox="0 0 56 92"
      width="36"
      height="59"
      aria-hidden="true"
      style={{ display: 'block', flexShrink: 0 }}
    >
      {/* Car body */}
      <rect x="11" y="9" rx="5" ry="5" width="34" height="72" fill="#1f2937" stroke="#4b5563" strokeWidth="1.5" />
      {/* Windshield / front glass */}
      <rect x="14" y="13" rx="3" ry="3" width="28" height="18" fill="#111827" stroke="#374151" strokeWidth="1" />
      {/* Rear glass */}
      <rect x="14" y="59" rx="3" ry="3" width="28" height="14" fill="#111827" stroke="#374151" strokeWidth="1" />
      {/* Centre console divider */}
      <line x1="28" y1="31" x2="28" y2="59" stroke="#374151" strokeWidth="1" />
      {/* Wheels */}
      <rect x="8"  y="16" rx="2" ry="2" width="6" height="11" fill="#374151" />
      <rect x="42" y="16" rx="2" ry="2" width="6" height="11" fill="#374151" />
      <rect x="8"  y="63" rx="2" ry="2" width="6" height="11" fill="#374151" />
      <rect x="42" y="63" rx="2" ry="2" width="6" height="11" fill="#374151" />
      {/* Active position dot */}
      <circle
        cx={step.cx}
        cy={step.cy}
        r="4"
        fill="#3b82f6"
        stroke="#93c5fd"
        strokeWidth="1.5"
      />
    </svg>
  )
}

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
    if (!window.confirm(t('Re-record? This will delete the current video.', '¿Grabar de nuevo? Esto borrará el video actual.'))) return
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

  const _step        = WALKROUND_STEPS[stepIndex] ?? WALKROUND_STEPS[WALKROUND_STEPS.length - 1]
  const _stepEs      = WALKROUND_STEPS_ES[stepIndex] ?? WALKROUND_STEPS_ES[WALKROUND_STEPS_ES.length - 1]
  const currentStep  = getLang() === 'es' ? { ..._step, label: _stepEs.label, hint: _stepEs.hint } : _step
  const stepProgress = stepSecsLeft === 0 ? 1 : 1 - (stepSecsLeft / currentStep.duration)
  const isLastStep   = stepIndex >= WALKROUND_STEPS.length - 1
  const allDone      = isLastStep && stepSecsLeft === 0

  return (
    // flex-1 + min-h-0 lets this component fill all available height without
    // overflowing — works in both portrait and landscape on phone or iPad.
    <div className="flex flex-col flex-1 min-h-0">

      {/* Video fills all remaining height; controls are overlaid so buttons
          are always reachable without scrolling regardless of orientation. */}
      <div className="relative flex-1 min-h-0 w-full bg-black rounded-2xl overflow-hidden">
        <video ref={cam.videoRef} autoPlay muted playsInline
          className={`absolute inset-0 w-full h-full object-cover ${phase === 'preview' ? 'opacity-30' : ''}`} />

        {/* Loading */}
        {phase === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70">
            <Loader className="w-10 h-10 text-brand-blue animate-spin" />
            <p className="text-white text-sm font-semibold">{t('Starting camera…', 'Iniciando cámara…')}</p>
          </div>
        )}

        {/* Error */}
        {phase === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 px-6 text-center">
            <AlertCircle className="w-10 h-10 text-red-400" />
            <p className="text-white font-bold">{t('Camera unavailable', 'Cámara no disponible')}</p>
            <p className="text-gray-400 text-sm">{cam.cameraError}</p>
            <button onClick={handleRetry} className="btn-ghost text-sm mt-2 w-auto px-6"><RefreshCw className="w-4 h-4" /> {t('Try Again', 'Intentar de nuevo')}</button>
          </div>
        )}

        {/* Ready — Start button overlaid at bottom */}
        {phase === 'ready' && (
          <div className="absolute bottom-0 left-0 right-0 px-3 pb-3 flex flex-col gap-2">
            <button onClick={handleStartRecording} className="btn-primary w-full">
              <Video className="w-6 h-6" />{t('Start Recording', 'Iniciar Grabación')}
            </button>
            <p className="text-gray-400 text-xs text-center">{t('The app will guide you around the vehicle step by step.', 'La app lo guiará por el vehículo paso a paso.')}</p>
          </div>
        )}

        {/* Recording — REC timer */}
        {phase === 'recording' && (
          <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/60 rounded-full px-3 py-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-white font-mono font-bold text-sm">{cam.formattedTime}</span>
          </div>
        )}

        {/* Recording — photo count badge */}
        {phase === 'recording' && capturedPhotos.length > 0 && (
          <div className="absolute top-3 right-3 bg-brand-blue/90 rounded-full px-2 py-1 text-white text-xs font-bold">
            {capturedPhotos.length} 📷
          </div>
        )}

        {/* Recording — step guide + Photo/Stop buttons, all overlaid at bottom */}
        {phase === 'recording' && (
          <div className="absolute bottom-0 left-0 right-0 px-3 pb-3">
            <div className="bg-black/80 backdrop-blur-sm rounded-xl px-3 py-3 flex flex-col gap-2">
              {/* Car position graphic + step header */}
              <div className="flex items-start gap-3">
                <CarPositionGraphic stepIndex={stepIndex} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="flex gap-1 items-center">
                      {WALKROUND_STEPS.map((_, i) => (
                        <div key={i} className={`rounded-full transition-all duration-300 ${
                          i < stepIndex ? 'w-1.5 h-1.5 bg-green-400'
                          : i === stepIndex ? 'w-2.5 h-2.5 bg-brand-blue'
                          : 'w-1.5 h-1.5 bg-gray-600'
                        }`} />
                      ))}
                      <span className="text-gray-400 text-xs font-semibold ml-1">
                        {stepIndex + 1}/{WALKROUND_STEPS.length}
                      </span>
                    </div>
                    <div className={`font-mono font-black text-2xl leading-none ${
                      allDone ? 'text-green-400' : stepSecsLeft <= 3 ? 'text-yellow-400' : 'text-white'
                    }`}>
                      {allDone ? '✓' : `${stepSecsLeft}s`}
                    </div>
                  </div>
                  <p className="text-white font-bold text-base leading-tight mt-1">📍 {currentStep.label}</p>
                  <p className="text-gray-300 text-xs mt-0.5 leading-tight">{currentStep.hint}</p>
                </div>
              </div>
              {/* Step progress bar */}
              <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-1000 ease-linear ${
                  allDone ? 'bg-green-400' : 'bg-brand-blue'
                }`} style={{ width: `${stepProgress * 100}%` }} />
              </div>
              {/* Photo + Stop buttons */}
              <div className="flex gap-3">
                <button onClick={handleCapturePhoto}
                  className="flex-1 bg-brand-mid/90 border border-brand-accent text-brand-white font-bold text-base py-3.5 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-transform">
                  <Camera className="w-5 h-5" />{t('Photo', 'Foto')}
                </button>
                <button onClick={handleStopRecording} disabled={!canStop}
                  className="flex-[2] btn-danger disabled:opacity-40 disabled:pointer-events-none">
                  <Square className="w-5 h-5 fill-white" />
                  {canStop
                    ? t('Stop Recording', 'Detener Grabación')
                    : t(`Stop (${Math.max(0, MIN_RECORD_SECONDS - totalSecs)}s)`, `Detener (${Math.max(0, MIN_RECORD_SECONDS - totalSecs)}s)`)}
                </button>
              </div>
              {!canStop && (
                <p className="text-yellow-500 text-xs text-center font-semibold">
                  {t(`⏱ Follow the steps above — Stop unlocks after ${MIN_RECORD_SECONDS}s`, `⏱ Siga los pasos — Detener se habilita después de ${MIN_RECORD_SECONDS}s`)}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Photo flash */}
        {photoFlash && <div className="absolute inset-0 bg-white opacity-70 pointer-events-none" />}

        {/* Preview overlay */}
        {phase === 'preview' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50">
            <CheckCircle className="w-12 h-12 text-green-400" />
            <p className="text-white font-bold text-lg">{t('Video Recorded', 'Video Grabado')}</p>
            {capturedPhotos.length > 0 && (
              <p className="text-gray-300 text-sm">
                {t(`${capturedPhotos.length} photo${capturedPhotos.length !== 1 ? 's' : ''} captured`,
                   `${capturedPhotos.length} foto${capturedPhotos.length !== 1 ? 's' : ''} capturada${capturedPhotos.length !== 1 ? 's' : ''}`)}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Preview controls — below the video (only shown after recording stops) */}
      {phase === 'preview' && (
        <div className="flex gap-3 shrink-0 pt-3">
          <button onClick={handleReRecord} className="flex-1 btn-ghost">
            <RefreshCw className="w-5 h-5" />{t('Re-record', 'Volver a grabar')}
          </button>
          <button onClick={handleContinue} disabled={continuing}
            className="flex-[2] btn-success disabled:opacity-50 disabled:pointer-events-none">
            <CheckCircle className="w-5 h-5" />{t('Continue', 'Continuar')}
          </button>
        </div>
      )}
    </div>
  )
}
