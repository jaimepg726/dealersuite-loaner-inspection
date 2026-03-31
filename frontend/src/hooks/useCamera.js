/**
 * useCamera — manages camera stream, MediaRecorder video, canvas overlay, and geolocation.
 *
 * Pipeline:
 *   camera stream → hidden <video> → requestAnimationFrame render loop
 *   → <canvas> (timestamp + geo overlay) → canvas.captureStream() → MediaRecorder
 *
 * The visible <canvas ref={cam.canvasRef}> shows what is actually being recorded.
 * The hidden <video ref={cam.videoRef}> is the camera source — not shown directly.
 *
 * Geolocation:
 *   watchPosition starts with startCamera().
 *   Status exposed via cam.geoStatus ('pending'|'granted'|'denied'|'unavailable').
 *   Full geo object retrieved via cam.getGeoData() before stopCamera().
 */

import { useState, useRef, useCallback, useEffect } from 'react'

const MIME_TYPES = [
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
]

function getSupportedMimeType() {
  for (const mime of MIME_TYPES) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) {
      return mime
    }
  }
  return ''
}

export default function useCamera() {
  const videoRef         = useRef(null)  // hidden camera source video
  const canvasRef        = useRef(null)  // visible canvas with overlay (also recorded)
  const streamRef        = useRef(null)
  const mediaRecorderRef = useRef(null)
  const chunksRef        = useRef([])
  const timerRef         = useRef(null)
  const resolveStopRef   = useRef(null)
  const animFrameRef     = useRef(null)
  const geoWatchRef      = useRef(null)
  const geoRef           = useRef({ latitude: null, longitude: null, accuracy: null, timestamp: null, status: 'pending' })
  const overlayCtxRef    = useRef({ vehicleLabel: '', type: '', porter: '' })

  const [isStreaming,     setIsStreaming]     = useState(false)
  const [isRecording,     setIsRecording]     = useState(false)
  const [recordingTime,   setRecordingTime]   = useState(0)
  const [cameraError,     setCameraError]     = useState(null)
  const [geoStatus,       setGeoStatus]       = useState('pending')
  // true when canvas.captureStream() is available — overlay will be burned into the video file.
  // false on iOS Safari / WKWebView which do not support captureStream.
  // Detected synchronously at init via prototype check so the warning shows
  // in the ready phase on first use — not deferred to after recording starts.
  const [overlaySupported, setOverlaySupported] = useState(
    () => typeof HTMLCanvasElement !== 'undefined' &&
          typeof HTMLCanvasElement.prototype.captureStream === 'function',
  )

  useEffect(() => {
    return () => { stopCamera() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Overlay context (vehicle label, type, porter name) ─────────────────────
  const setOverlayContext = useCallback((ctx) => {
    overlayCtxRef.current = { ...overlayCtxRef.current, ...ctx }
  }, [])

  // ── Geolocation ────────────────────────────────────────────────────────────
  function _startGeo() {
    if (!navigator.geolocation) {
      geoRef.current = { ...geoRef.current, status: 'unavailable' }
      setGeoStatus('unavailable')
      return
    }
    setGeoStatus('pending')
    geoRef.current = { ...geoRef.current, status: 'pending' }
    try {
      geoWatchRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          geoRef.current = {
            latitude:  pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy:  pos.coords.accuracy,
            timestamp: pos.timestamp,
            status:    'granted',
          }
          setGeoStatus('granted')
        },
        (err) => {
          const s = err.code === 1 ? 'denied' : 'unavailable'
          geoRef.current = { ...geoRef.current, status: s }
          setGeoStatus(s)
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 30000 },
      )
    } catch {
      geoRef.current = { ...geoRef.current, status: 'unavailable' }
      setGeoStatus('unavailable')
    }
  }

  function _stopGeo() {
    if (geoWatchRef.current !== null) {
      try { navigator.geolocation.clearWatch(geoWatchRef.current) } catch {}
      geoWatchRef.current = null
    }
  }

  const getGeoData = useCallback(() => ({ ...geoRef.current }), [])

  // ── Canvas overlay rendering ───────────────────────────────────────────────
  function _drawOverlay(ctx, w, h) {
    const now     = new Date()
    const dateStr = now.toISOString().slice(0, 19).replace('T', '  ') + ' UTC'
    const geo     = geoRef.current
    const oc      = overlayCtxRef.current

    const lines = [dateStr]
    if (geo.status === 'granted' && geo.latitude !== null) {
      const lat = geo.latitude.toFixed(5)
      const lon = geo.longitude.toFixed(5)
      const acc = Math.round(geo.accuracy)
      lines.push(`GPS ${lat}, ${lon}  \u00b1${acc}m`)
    } else if (geo.status === 'denied') {
      lines.push('GPS: permission denied')
    } else if (geo.status === 'pending') {
      lines.push('GPS: locating\u2026')
    } else {
      lines.push('GPS: unavailable')
    }
    const unitPart = oc.vehicleLabel ? `Unit ${oc.vehicleLabel}` : ''
    const typePart = oc.type        ? String(oc.type).toLowerCase() : ''
    if (unitPart || typePart) lines.push([unitPart, typePart].filter(Boolean).join('  '))
    if (oc.porter) lines.push(`Porter: ${oc.porter}`)

    const fontSize = Math.max(11, Math.min(16, Math.round(w * 0.018)))
    ctx.font      = `bold ${fontSize}px 'Courier New', monospace`
    ctx.textBaseline = 'top'

    const padding = 8
    const lineH   = Math.round(fontSize * 1.55)
    const maxW    = lines.reduce((m, l) => Math.max(m, ctx.measureText(l).width), 0)
    const boxW    = maxW + padding * 2
    const boxH    = lines.length * lineH + padding

    const margin  = 8
    const boxX    = margin
    const boxY    = h - boxH - margin

    ctx.fillStyle = 'rgba(0,0,0,0.62)'
    ctx.fillRect(boxX, boxY, boxW, boxH)
    ctx.fillStyle = '#ffffff'
    lines.forEach((line, i) => ctx.fillText(line, boxX + padding, boxY + padding / 2 + i * lineH))
  }

  function _startRenderLoop() {
    if (!canvasRef.current || !videoRef.current) return

    const video  = videoRef.current
    const canvas = canvasRef.current

    const setDimensions = () => {
      const vw = video.videoWidth  || 1280
      const vh = video.videoHeight || 720
      if (canvas.width !== vw || canvas.height !== vh) {
        canvas.width  = vw
        canvas.height = vh
      }
    }

    const render = () => {
      if (!canvasRef.current || !videoRef.current) return
      const ctx = canvasRef.current.getContext('2d')
      if (!ctx) return
      setDimensions()
      ctx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height)
      _drawOverlay(ctx, canvasRef.current.width, canvasRef.current.height)
      animFrameRef.current = requestAnimationFrame(render)
    }

    if (video.readyState >= 2) {
      setDimensions()
      render()
    } else {
      video.addEventListener('loadedmetadata', () => { setDimensions(); render() }, { once: true })
    }
  }

  function _stopRenderLoop() {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
  }

  // ── Start camera ───────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    setCameraError(null)
    _startGeo()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          frameRate:  { ideal: 30 },
        },
        audio: false,
      })
      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }

      _startRenderLoop()
      setIsStreaming(true)
      return stream
    } catch (err) {
      const msg = err.name === 'NotAllowedError'
        ? 'Camera permission denied — allow camera access in browser settings'
        : err.name === 'NotFoundError'
          ? 'No camera found on this device'
          : `Camera error: ${err.message}`
      setCameraError(msg)
      throw new Error(msg)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stop camera ────────────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    _stopRenderLoop()
    _stopGeo()
    clearInterval(timerRef.current)
    timerRef.current = null

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) { videoRef.current.srcObject = null }

    setIsStreaming(false)
    setIsRecording(false)
    setRecordingTime(0)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Start recording ────────────────────────────────────────────────────────
  const startRecording = useCallback(() => {
    if (!streamRef.current) throw new Error('Camera not started')
    if (isRecording) return

    chunksRef.current = []
    const mimeType = getSupportedMimeType()
    const options  = mimeType ? { mimeType } : {}

    // Prefer canvas stream (captures overlay); fall back to raw camera if unavailable.
    // iOS Safari / WKWebView do NOT support captureStream — overlay is UI-only on those devices.
    const canvasEl = canvasRef.current
    const canCapture = canvasEl && typeof canvasEl.captureStream === 'function'
    setOverlaySupported(canCapture)
    const recordSource = canCapture ? canvasEl.captureStream(30) : streamRef.current

    const recorder = new MediaRecorder(recordSource, options)
    mediaRecorderRef.current = recorder

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
    }
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType || 'video/webm' })
      resolveStopRef.current?.(blob)
      resolveStopRef.current = null
    }

    recorder.start(250)

    const startTime = Date.now()
    timerRef.current = setInterval(() => {
      setRecordingTime(Math.floor((Date.now() - startTime) / 1000))
    }, 500)

    setIsRecording(true)
  }, [isRecording])

  // ── Stop recording → returns video Blob ───────────────────────────────────
  const stopRecording = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
        reject(new Error('Not recording'))
        return
      }
      resolveStopRef.current = resolve
      clearInterval(timerRef.current)
      timerRef.current = null
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    })
  }, [])

  // ── Capture photo (snapshot from canvas — includes overlay) ───────────────
  const capturePhoto = useCallback(() => {
    return new Promise((resolve, reject) => {
      const canvas = canvasRef.current
      if (!canvas || !isStreaming) {
        reject(new Error('Camera not active'))
        return
      }
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob)
          else reject(new Error('Photo capture failed'))
        },
        'image/jpeg',
        0.88,
      )
    })
  }, [isStreaming])

  // ── Toggle flashlight ──────────────────────────────────────────────────────
  const toggleFlash = useCallback(async (on) => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    try { await track.applyConstraints({ advanced: [{ torch: on }] }) } catch {}
  }, [])

  const formattedTime = `${String(Math.floor(recordingTime / 60)).padStart(2, '0')}:${String(recordingTime % 60).padStart(2, '0')}`

  return {
    videoRef, canvasRef,
    isStreaming, isRecording, recordingTime, formattedTime, cameraError,
    geoStatus, getGeoData, setOverlayContext,
    overlaySupported,
    startCamera, stopCamera,
    startRecording, stopRecording,
    capturePhoto, toggleFlash,
  }
}
