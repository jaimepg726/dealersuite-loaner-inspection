/**
 * useInspection — manages the lifecycle of an active inspection.
 *
 * Upload strategy:
 * 1. Try direct-to-Drive: GET /upload-session -> PUT blob directly to Drive
 *    resumable URL -> POST /finalize-upload with Drive file ID.
 *    Railway handles only tiny JSON — zero media bytes through Railway.
 * 2. Fall back to legacy /upload (multipart through Railway) if Drive
 *    not connected or session creation fails.
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import api from '../utils/api'

const POLL_INTERVAL_MS = 2500
const POLL_MAX_TRIES = 12

export default function useInspection() {
  const [inspection, setInspection] = useState(null)
  const [starting, setStarting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadPct, setUploadPct] = useState(0)
  const [error, setError] = useState(null)

  const pollRef = useRef(null)
  const uploadInFlightRef = useRef(false)
  const videoUploadedRef = useRef(false) // true once a video upload completes for this inspection

  // Mirror inspection state into a ref so uploadFile never closes over a stale
  // inspection value, and does NOT need inspection in its useCallback deps.
  // This prevents uploadFile from being recreated mid-upload (which was the
  // root cause of double-upload: setInspection() after video → new uploadFile
  // reference → stale closure in kickOffUploads photo loop).
  const inspectionRef = useRef(null)
  useEffect(() => { inspectionRef.current = inspection }, [inspection])

  function clearPoll() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  async function fetchInspection(id) {
    const { data } = await api.get(`/api/inspect/${id}`)
    return data
  }

  function startPollingForFolder(id) {
    let tries = 0
    clearPoll()
    pollRef.current = setInterval(async () => {
      tries++
      try {
        const data = await fetchInspection(id)
        if (data.drive_folder_id) {
          setInspection(data); clearPoll()
        } else if (tries >= POLL_MAX_TRIES) {
          clearPoll()
        }
      } catch { clearPoll() }
    }, POLL_INTERVAL_MS)
  }

  // ── Resume an existing inspection by ID (no new /start call) ──────────────
  const resume = useCallback(async (id) => {
    try {
      const data = await fetchInspection(id)
      setInspection(data)
      if (!data.drive_folder_id) startPollingForFolder(data.id)
      return data
    } catch (err) {
      const msg = err.response?.data?.detail || 'Could not resume inspection'
      setError(msg); throw err
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Start ──────────────────────────────────────────────────────────────────
  const start = useCallback(async (vehicleId, type) => {
    setStarting(true); setError(null)
    try {
      const { data } = await api.post('/api/inspect/start', {
        vehicle_id: vehicleId,
        inspection_type: type,
      })
      setInspection(data)
      if (!data.drive_folder_id) startPollingForFolder(data.id)
      return data
    } catch (err) {
      const msg = err.response?.data?.detail || 'Could not start inspection'
      setError(msg); throw err
    } finally {
      setStarting(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Direct-to-Drive upload ──────────────────────────────────────────────────
  async function _directDriveUpload(blob, mediaType, damageLocation, inspectionId, onProgress) {
    const mimeType = blob.type || (mediaType === 'video' ? 'video/mp4' : 'image/jpeg')
    const params = new URLSearchParams({ mime_type: mimeType, media_type: mediaType })
    if (damageLocation) params.set('damage_location', damageLocation)
    let session
    try {
      const { data } = await api.post(`/api/inspect/${inspectionId}/upload-session?${params}`)
      session = data
    } catch (err) {
      if (err.response?.status === 409) {
        console.warn('upload-session 409: duplicate video upload detected — skipping')
        return { file_id: null, file_url: '', backend: 'skipped-duplicate' }
      }
      throw err
    }
    const driveFileId = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('PUT', session.resumable_url)
      xhr.setRequestHeader('Content-Type', mimeType)
      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable && onProgress) onProgress(Math.round((evt.loaded / evt.total) * 100))
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { const fr = JSON.parse(xhr.responseText); if (fr.id) { resolve(fr.id); return } } catch {}
          resolve(null)
        } else { reject(new Error(`Drive PUT failed: ${xhr.status}`)) }
      }
      xhr.onerror = () => reject(new Error('Drive PUT network error'))
      xhr.send(blob)
    })
    const { data: finalized } = await api.post(`/api/inspect/${inspectionId}/finalize-upload`, {
      media_record_id: session.media_record_id,
      drive_file_id: driveFileId ?? session.media_record_id.toString(),
      mime_type: mimeType, media_type: mediaType, file_size: blob.size,
    })
    return finalized
  }

  // ── Legacy upload (Railway proxy — fallback when Drive not connected) ────────
  async function _legacyUpload(blob, mediaType, damageLocation, inspectionId, onProgress) {
    const form = new FormData()
    const ext = mediaType === 'video' ? 'mp4' : 'jpg'
    form.append('file', blob, `${mediaType}.${ext}`)
    const params = new URLSearchParams({ media_type: mediaType })
    if (damageLocation) params.set('damage_location', damageLocation)
    const { data } = await api.post(`/api/inspect/${inspectionId}/upload?${params}`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (evt) => {
        if (evt.total && onProgress) onProgress(Math.round((evt.loaded * 100) / evt.total))
      },
    })
    return data
  }

  // ── uploadFile — direct Drive first, legacy fallback ───────────────────────
  // IMPORTANT: empty deps — uses inspectionRef to avoid stale closure/double-upload bug
  const uploadFile = useCallback(async (blob, mediaType, damageLocation = null) => {
    const currentInspection = inspectionRef.current
    if (!currentInspection?.id) throw new Error('No active inspection')
    if (mediaType === 'video' && videoUploadedRef.current) {
      console.warn('Video already uploaded for this inspection — skipping duplicate')
      return null
    }
    if (uploadInFlightRef.current) {
      console.warn('Upload already in flight — ignoring duplicate call')
      return
    }
    uploadInFlightRef.current = true
    setUploading(true); setUploadPct(0); setError(null)
    try {
      let result
      try {
        result = await _directDriveUpload(blob, mediaType, damageLocation, currentInspection.id, (pct) => setUploadPct(pct))
      } catch (directErr) {
        console.warn('Direct Drive upload failed, falling back to Railway proxy:', directErr.message)
        setUploadPct(0)
        result = await _legacyUpload(blob, mediaType, damageLocation, currentInspection.id, (pct) => setUploadPct(pct))
      }
      if (mediaType === 'video') videoUploadedRef.current = true
      const updated = await fetchInspection(currentInspection.id)
      setInspection(updated)
      return result
    } catch (err) {
      const msg = err.response?.data?.detail || 'Upload failed'
      setError(msg); throw err
    } finally {
      uploadInFlightRef.current = false
      setUploading(false); setUploadPct(0)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Complete ────────────────────────────────────────────────────────────────
  const complete = useCallback(async (photoCount = 0, notes = null) => {
    const currentInspection = inspectionRef.current
    if (!currentInspection?.id) throw new Error('No active inspection')
    setError(null)
    try {
      const { data } = await api.post(`/api/inspect/${currentInspection.id}/complete`, { photo_count: photoCount, notes })
      clearPoll(); setInspection(data); return data
    } catch (err) {
      const msg = err.response?.data?.detail || 'Could not complete inspection'
      setError(msg); throw err
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reset ───────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    clearPoll()
    setInspection(null); setStarting(false); setUploading(false)
    setUploadPct(0); setError(null)
    uploadInFlightRef.current = false
    videoUploadedRef.current = false
    inspectionRef.current = null
  }, [])

  return { inspection, starting, uploading, uploadPct, error, start, resume, uploadFile, complete, reset }
}
