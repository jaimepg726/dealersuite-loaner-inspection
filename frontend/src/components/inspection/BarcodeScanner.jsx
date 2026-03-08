/**
 * DealerSuite — Barcode Scanner
 * Uses ZXing BrowserMultiFormatReader to read Code 39 and Code 128
 * barcodes from the device camera in real time.
 *
 * Works on iPad camera, iPhone, Android.
 * Designed for windshield and door-jamb VIN barcodes.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { BrowserMultiFormatReader, BarcodeFormat, DecodeHintType } from '@zxing/library'
import { validateVIN } from '../../hooks/useVINValidation'
import { ScanLine, CameraOff, RefreshCw } from 'lucide-react'

// ZXing hints — only scan formats used on VIN stickers
const HINTS = new Map()
HINTS.set(DecodeHintType.POSSIBLE_FORMATS, [
  BarcodeFormat.CODE_39,
  BarcodeFormat.CODE_128,
  BarcodeFormat.PDF_417,   // some DMV window stickers
])
HINTS.set(DecodeHintType.TRY_HARDER, true)

export default function BarcodeScanner({ onDetected, active = true }) {
  const videoRef    = useRef(null)
  const readerRef   = useRef(null)
  const [camError,  setCamError]  = useState(null)
  const [scanning,  setScanning]  = useState(false)
  const [flashOn,   setFlashOn]   = useState(false)
  const [cameras,   setCameras]   = useState([])
  const [camIndex,  setCamIndex]  = useState(0)   // cycle through cameras

  // ── Start scanning ──────────────────────────────────────────────────────
  const startScan = useCallback(async () => {
    if (!videoRef.current) return
    setCamError(null)

    try {
      const reader = new BrowserMultiFormatReader(HINTS)
      readerRef.current = reader

      // List available cameras — prefer rear camera for barcode scanning
      const devices = await BrowserMultiFormatReader.listVideoInputDevices()
      setCameras(devices)

      const deviceId = devices[camIndex]?.deviceId || undefined

      setScanning(true)
      await reader.decodeFromVideoDevice(deviceId, videoRef.current, (result, err) => {
        if (result) {
          const raw = result.getText()
          const { valid, vin } = validateVIN(raw)
          if (valid) {
            // Haptic feedback on mobile
            if (navigator.vibrate) navigator.vibrate(100)
            onDetected(vin)
          }
        }
        // Ignore NotFoundException — normal between frames
      })
    } catch (err) {
      console.error('Camera error:', err)
      setCamError(
        err.name === 'NotAllowedError'
          ? 'Camera permission denied. Please allow camera access in your browser settings.'
          : 'Could not access camera. Try the manual entry option.'
      )
      setScanning(false)
    }
  }, [camIndex, onDetected])

  // ── Stop scanning ───────────────────────────────────────────────────────
  const stopScan = useCallback(() => {
    readerRef.current?.reset()
    setScanning(false)
  }, [])

  // ── Lifecycle ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (active) {
      startScan()
    } else {
      stopScan()
    }
    return () => stopScan()
  }, [active, startScan, stopScan])

  // ── Torch (flashlight) ──────────────────────────────────────────────────
  async function toggleFlash() {
    try {
      const stream = videoRef.current?.srcObject
      const track  = stream?.getVideoTracks?.()[0]
      if (!track) return
      await track.applyConstraints({ advanced: [{ torch: !flashOn }] })
      setFlashOn((v) => !v)
    } catch {
      // torch not supported on this device — silent
    }
  }

  // ── Flip camera ─────────────────────────────────────────────────────────
  function flipCamera() {
    stopScan()
    setCamIndex((i) => (i + 1) % Math.max(cameras.length, 1))
  }
  useEffect(() => {
    if (active && cameras.length > 0) startScan()
  }, [camIndex]) // eslint-disable-line

  // ── Render ───────────────────────────────────────────────────────────────
  if (camError) {
    return (
      <div className="flex flex-col items-center justify-center gap-5 p-8 text-center">
        <CameraOff className="w-16 h-16 text-brand-red" />
        <p className="text-red-400 text-sm font-medium">{camError}</p>
        <button onClick={startScan} className="btn-ghost gap-2 max-w-xs">
          <RefreshCw className="w-5 h-5" /> Try Again
        </button>
      </div>
    )
  }

  return (
    <div className="relative w-full aspect-[3/4] max-w-sm mx-auto overflow-hidden rounded-2xl bg-black">

      {/* Live camera feed */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        playsInline
        muted
        autoPlay
      />

      {/* Scanning overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        {/* Corner brackets */}
        <div className="relative w-4/5 aspect-[4/1]">
          <span className="absolute top-0 left-0  w-8 h-8 border-t-4 border-l-4 border-brand-blue rounded-tl-lg" />
          <span className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-brand-blue rounded-tr-lg" />
          <span className="absolute bottom-0 left-0  w-8 h-8 border-b-4 border-l-4 border-brand-blue rounded-bl-lg" />
          <span className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-brand-blue rounded-br-lg" />

          {/* Animated scan line */}
          {scanning && (
            <ScanLine
              className="absolute inset-x-2 animate-bounce text-brand-blue opacity-80"
              style={{ top: '40%' }}
            />
          )}
        </div>
      </div>

      {/* Controls — bottom row */}
      <div className="absolute bottom-4 inset-x-0 flex items-center justify-center gap-6 px-4">
        {/* Flash toggle */}
        <button
          onClick={toggleFlash}
          className={`w-12 h-12 rounded-full flex items-center justify-center
                      text-white font-bold text-lg transition-colors
                      ${flashOn ? 'bg-yellow-500' : 'bg-black/60 border border-white/30'}`}
          aria-label="Toggle flashlight"
        >
          ⚡
        </button>

        {/* Flip camera (only if multiple cameras) */}
        {cameras.length > 1 && (
          <button
            onClick={flipCamera}
            className="w-12 h-12 rounded-full bg-black/60 border border-white/30
                       flex items-center justify-center"
            aria-label="Flip camera"
          >
            <RefreshCw className="w-5 h-5 text-white" />
          </button>
        )}
      </div>

      {/* Status label */}
      <div className="absolute top-3 inset-x-0 flex justify-center pointer-events-none">
        <span className="bg-black/60 text-white text-xs font-semibold px-3 py-1 rounded-full">
          {scanning ? 'Scanning for barcode…' : 'Starting camera…'}
        </span>
      </div>
    </div>
  )
}
