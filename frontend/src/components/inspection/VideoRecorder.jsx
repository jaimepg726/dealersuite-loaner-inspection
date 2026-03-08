/**
 * DealerSuite — VideoRecorder
 *
 * Full-screen camera UI for the walkround video inspection.
 *
 * States:
 *   loading  → camera starting
 *   ready    → live preview, waiting for porter to tap START
 *   recording → timer + PHOTO button + STOP button
 *   preview  → video recorded, shows thumbnail count; can re-record or continue
 *   error    → camera permission denied or device error
 *
 * Props:
 *   onComplete(videoBlob, capturedPhotos: Blob[])  — called when porter taps "Continue"
 */

import { useState, useEffect, useRef } from 'react'
import {
  Video,
  Square,
  Camera,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Loader,
} from 'lucide-react'
import useCamera from '../../hooks/useCamera'

export default function VideoRecorder({ onComplete }) {
  const cam = useCamera()

  const [phase,          setPhase]          = useState('loading')  // loading|ready|recording|preview|error
  const [capturedPhotos, setCapturedPhotos]  = useState([])  // Blobs from in-recording snapshots
  const [videoBlob,      setVideoBlob]       = useState(null)
  const [photoFlash,     setPhotoFlash]      = useState(false)  // white flash on capture

  const photoInputRef = useRef(null)  // for optional extra damage photo

  // ── Auto-start camera on mount ────────────────────────────────────────────
  useEffect(() => {
    cam.startCamera()
      .then(() => setPhase('ready'))
      .catch(() => setPhase('error'))

    return () => cam.stopCamera()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ───────────────────────────────────────────────────────────────

  function handleStartRecording() {
    cam.startRecording()
    setCapturedPhotos([])
    setPhase('recording')
  }

  async function handleCapturePhoto() {
    try {
      const blob = await cam.capturePhoto()
      setCapturedPhotos(prev => [...prev, blob])
      // Flash effect
      setPhotoFlash(true)
      setTimeout(() => setPhotoFlash(false), 150)
    } catch (err) {
      console.error('Photo capture failed:', err)
    }
  }

  async function handleStopRecording() {
    try {
      const blob = await cam.stopRecording()
      setVideoBlob(blob)
      setPhase('preview')
    } catch (err) {
      console.error('Stop recording failed:', err)
    }
  }

  function handleReRecord() {
    setVideoBlob(null)
    setCapturedPhotos([])
    setPhase('ready')
  }

  function handleContinue() {
    cam.stopCamera()
    onComplete(videoBlob, capturedPhotos)
  }

  // ── Retry after error ─────────────────────────────────────────────────────
  function handleRetry() {
    setPhase('loading')
    cam.startCamera()
      .then(() => setPhase('ready'))
      .catch(() => setPhase('error'))
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4">

      {/* ── Camera viewfinder ───────────────────────────────────────────── */}
      <div className="relative w-full bg-black rounded-2xl overflow-hidden"
           style={{ aspectRatio: '16/9' }}>

        {/* Live video element — always mounted for ref stability */}
        <video
          ref={cam.videoRef}
          autoPlay
          muted
          playsInline
          className={`w-full h-full object-cover ${phase === 'preview' ? 'opacity-30' : ''}`}
        />

        {/* Loading overlay */}
        {phase === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70">
            <Loader className="w-10 h-10 text-brand-blue animate-spin" />
            <p className="text-white text-sm font-semibold">Starting camera…</p>
          </div>
        )}

        {/* Error overlay */}
        {phase === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 px-6 text-center">
            <AlertCircle className="w-10 h-10 text-red-400" />
            <p className="text-white font-bold">Camera unavailable</p>
            <p className="text-gray-400 text-sm">{cam.cameraError}</p>
            <button onClick={handleRetry} className="btn-ghost text-sm mt-2 w-auto px-6">
              <RefreshCw className="w-4 h-4" /> Try Again
            </button>
          </div>
        )}

        {/* Recording indicator + timer */}
        {phase === 'recording' && (
          <div className="absolute top-3 left-3 flex items-center gap-2
                          bg-black/60 rounded-full px-3 py-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-white font-mono font-bold text-sm">
              {cam.formattedTime}
            </span>
          </div>
        )}

        {/* Photo flash overlay */}
        {photoFlash && (
          <div className="absolute inset-0 bg-white opacity-70 pointer-events-none" />
        )}

        {/* Preview overlay */}
        {phase === 'preview' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50">
            <CheckCircle className="w-12 h-12 text-green-400" />
            <p className="text-white font-bold text-lg">Video Recorded</p>
            {capturedPhotos.length > 0 && (
              <p className="text-gray-300 text-sm">
                {capturedPhotos.length} photo{capturedPhotos.length !== 1 ? 's' : ''} captured
              </p>
            )}
          </div>
        )}

        {/* Photo count badge during recording */}
        {phase === 'recording' && capturedPhotos.length > 0 && (
          <div className="absolute top-3 right-3 bg-brand-blue/90 rounded-full
                          px-2 py-1 text-white text-xs font-bold">
            {capturedPhotos.length} 📷
          </div>
        )}
      </div>

      {/* ── Controls ────────────────────────────────────────────────────── */}

      {/* READY — start recording */}
      {phase === 'ready' && (
        <button
          onClick={handleStartRecording}
          className="btn-danger"
        >
          <Video className="w-6 h-6" />
          Start Recording
        </button>
      )}

      {/* RECORDING — photo + stop */}
      {phase === 'recording' && (
        <div className="flex gap-3">
          <button
            onClick={handleCapturePhoto}
            className="flex-1 bg-brand-mid border border-brand-accent text-brand-white
                       font-bold text-base py-4 rounded-2xl
                       flex items-center justify-center gap-2
                       active:scale-95 transition-transform"
          >
            <Camera className="w-5 h-5" />
            Photo
          </button>
          <button
            onClick={handleStopRecording}
            className="flex-[2] btn-danger"
          >
            <Square className="w-5 h-5 fill-white" />
            Stop Recording
          </button>
        </div>
      )}

      {/* PREVIEW — re-record or continue */}
      {phase === 'preview' && (
        <div className="flex gap-3">
          <button
            onClick={handleReRecord}
            className="flex-1 btn-ghost"
          >
            <RefreshCw className="w-5 h-5" />
            Re-record
          </button>
          <button
            onClick={handleContinue}
            className="flex-[2] btn-success"
          >
            <CheckCircle className="w-5 h-5" />
            Continue
          </button>
        </div>
      )}

      {/* Helper text */}
      {phase === 'ready' && (
        <p className="text-gray-500 text-xs text-center">
          Walk around the vehicle while recording. Tap Photo to capture damage.
        </p>
      )}
      {phase === 'recording' && (
        <p className="text-gray-500 text-xs text-center">
          Walk around the vehicle. Tap Photo for each damage area. Tap Stop when done.
        </p>
      )}
    </div>
  )
}
