/**
 * useCamera — manages camera stream, MediaRecorder video, and canvas photo capture.
 *
 * Usage:
 *   const cam = useCamera()
 *   <video ref={cam.videoRef} autoPlay muted playsInline />
 *
 *   await cam.startCamera()
 *   cam.startRecording()
 *   const photoBlob = await cam.capturePhoto()
 *   const videoBlob = await cam.stopRecording()
 *   cam.stopCamera()
 */

import { useState, useRef, useCallback, useEffect } from 'react'

// Preferred MIME types — browser picks the first it supports
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
  return ''  // browser default
}

export default function useCamera() {
  const videoRef          = useRef(null)
  const streamRef         = useRef(null)
  const mediaRecorderRef  = useRef(null)
  const chunksRef         = useRef([])
  const timerRef          = useRef(null)
  const resolveStopRef    = useRef(null)   // resolves when MediaRecorder fires 'stop'

  const [isStreaming,    setIsStreaming]    = useState(false)
  const [isRecording,    setIsRecording]    = useState(false)
  const [recordingTime,  setRecordingTime]  = useState(0)   // seconds
  const [cameraError,    setCameraError]    = useState(null)

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Start camera ──────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    setCameraError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode:  { ideal: 'environment' },  // rear camera
          width:       { ideal: 1280 },
          height:      { ideal: 720 },
        },
        audio: false,
      })
      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }

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
  }, [])

  // ── Stop camera ───────────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    clearInterval(timerRef.current)
    timerRef.current = null

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }

    setIsStreaming(false)
    setIsRecording(false)
    setRecordingTime(0)
  }, [])

  // ── Start recording ───────────────────────────────────────────────────────
  const startRecording = useCallback(() => {
    if (!streamRef.current) throw new Error('Camera not started')
    if (isRecording) return

    chunksRef.current = []
    const mimeType = getSupportedMimeType()

    const options = mimeType ? { mimeType } : {}
    const recorder = new MediaRecorder(streamRef.current, options)
    mediaRecorderRef.current = recorder

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
    }

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, {
        type: mimeType || 'video/webm',
      })
      resolveStopRef.current?.(blob)
      resolveStopRef.current = null
    }

    recorder.start(250)   // collect a chunk every 250 ms

    // Recording timer
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

  // ── Capture photo (canvas snapshot of live video) ─────────────────────────
  const capturePhoto = useCallback(() => {
    return new Promise((resolve, reject) => {
      const video = videoRef.current
      if (!video || !isStreaming) {
        reject(new Error('Camera not active'))
        return
      }

      const canvas   = document.createElement('canvas')
      canvas.width   = video.videoWidth  || 1280
      canvas.height  = video.videoHeight || 720
      const ctx      = canvas.getContext('2d')
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

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

  // ── Toggle flashlight ─────────────────────────────────────────────────────
  const toggleFlash = useCallback(async (on) => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    try {
      await track.applyConstraints({ advanced: [{ torch: on }] })
    } catch {
      // Not all devices support torch
    }
  }, [])

  // ── Formatted timer (MM:SS) ───────────────────────────────────────────────
  const formattedTime = `${String(Math.floor(recordingTime / 60)).padStart(2, '0')}:${String(recordingTime % 60).padStart(2, '0')}`

  return {
    videoRef,
    isStreaming,
    isRecording,
    recordingTime,
    formattedTime,
    cameraError,
    startCamera,
    stopCamera,
    startRecording,
    stopRecording,
    capturePhoto,
    toggleFlash,
  }
}
