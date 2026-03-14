/**
 * useInspection — manages the lifecycle of an active inspection.
 *
 * Upload strategy:
 *  1. Try direct-to-Drive: GET /upload-session -> PUT blob directly to Drive
 *     resumable URL -> POST /finalize-upload with Drive file ID.
 *     Railway handles only tiny JSON — zero media bytes through Railway.
 *  2. Fall back to legacy /upload (multipart through Railway) if Drive
 *     not connected or session creation fails.
 */
import { useState, useRef, useCallback } from 'react'
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
        if (data.drive_folder_id) { setInspection(data); clearPoll() }
        else if (tries >= POLL_MAX_TRIES) { clearPoll() }
      } catch { clearPoll() }
    }, POLL_INTERVAL_MS)
  }

  // ── Start ────────────────────────────────────────────────────────────────────
  const start = useCallback(async (vehicleId, type) => {
    setStarting(true); setError(null)
    try {
      const { data } = await api.post('/api/inspect/start', {
        vehicle_id: vehicleId, inspection_type: type,
      })
      setInspection(data)
      if (!data.drive_folder_id) startPollingForFolder(data.id)
      return data
    } catch (err) {
      const msg = err.response?.data?.detail || 'Could not start inspection'
      setError(msg); throw err
    } finally { setStarting(false) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Direct-to-Drive upload ───────────────────────────────────────────────────
  async function _directDriveUpload(blob, mediaType, damageLocation, inspectionId, onProgress) {
    const mimeType = blob.type || (mediaType === 'video' ? 'video/mp4' : 'image/jpeg')
    const params = new URLSearchParams({ mime_type: mimeType, media_type: mediaType })
    if (damageLocation) params.set('damage_location', damageLocation)

    // Step 1: Get Drive resumable URL from Railway (tiny JSON, no media bytes)
    const { data: session } = await api.post(
      `/api/inspect/${inspectionId}/upload-session?${params}`
    )

    // Step 2: PUT blob directly to Google Drive resumable URL.
    // Use raw XHR — NOT the api axios instance — for two critical reasons:
    //   (a) Must NOT attach the DealerSuite JWT to a Google API request
    //   (b) Must NOT prepend the Railway base URL to the Google URL
    // Drive returns the file resource JSON (with "id") on 200/201.
    const driveFileId = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('PUT', session.resumable_url)
      xhr.setRequestHeader('Content-Type', mimeType)
      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable && onProgress) {
          onProgress(Math.round((evt.loaded / evt.total) * 100))
        }
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const fileResource = JSON.parse(xhr.responseText)
            if (fileResource.id) { resolve(fileResource.id); return }
          } catch {}
          reject(new Error('Drive upload succeeded but could not parse file ID'))
        } else {
          reject(new Error(`Drive PUT failed: ${xhr.status}`))
        }
      }
      xhr.onerror = () => reject(new Error('Drive PUT network error'))
      xhr.send(blob)
    })

    // Step 3: Tell Railway the Drive file ID (tiny JSON, no media bytes)
    const { data: finalized } = await api.post(
      `/api/inspect/${inspectionId}/finalize-upload`,
      {
        media_record_id: session.media_record_id,
        drive_file_id: driveFileId,
        mime_type: mimeType,
        media_type: mediaType,
        file_size: blob.size,
      }
    )
    return finalized
  }

  // ── Legacy upload (Railway proxy — fallback when Drive not connected) ─────────
  async function _legacyUpload(blob, mediaType, damageLocation, inspectionId, onProgress) {
    const form = new FormData()
    const ext = mediaType === 'video' ? 'mp4' : 'jpg'
    form.append('file', blob, `${mediaType}.${ext}`)
    const params = new URLSearchParams({ media_type: mediaType })
    if (damageLocation) params.set('damage_location', damageLocation)
    const { data } = await api.post(
      `/api/inspect/${inspectionId}/upload?${params}`,
      form,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (evt) => {
          if (evt.total && onProgress) onProgress(Math.round((evt.loaded * 100) / evt.total))
        },
      }
    )
    return data
  }

  // ── uploadFile — direct Drive first, legacy fallback ─────────────────────────
  const uploadFile = useCallback(async (blob, mediaType, damageLocation = null) => {
    if (!inspection?.id) throw new Error('No active inspection')
    setUploading(true); setUploadPct(0); setError(null)

    try {
      let result
      try {
        result = await _directDriveUpload(
          blob, mediaType, damageLocation, inspection.id,
          (pct) => setUploadPct(pct)
        )
      } catch (directErr) {
        // Drive not connected or session failed — fall back to legacy
        console.warn('Direct Drive upload failed, falling back to Railway proxy:', directErr.message)
        setUploadPct(0)
        result = await _legacyUpload(
          blob, mediaType, damageLocation, inspection.id,
          (pct) => setUploadPct(pct)
        )
      }

      const updated = await fetchInspection(inspection.id)
      setInspection(updated)
      return result
    } catch (err) {
      const msg = err.response?.data?.detail || 'Upload failed'
      setError(msg); throw err
    } finally { setUploading(false); setUploadPct(0) }
  }, [inspection]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Complete ──────────────────────────────────────────────────────────────────
  const complete = useCallback(async (photoCount = 0, notes = null) => {
    if (!inspection?.id) throw new Error('No active inspection')
    setError(null)
    try {
      const { data } = await api.post(`/api/inspect/${inspection.id}/complete`, {
        photo_count: photoCount, notes,
      })
      clearPoll(); setInspection(data); return data
    } catch (err) {
      const msg = err.response?.data?.detail || 'Could not complete inspection'
      setError(msg); throw err
    }
  }, [inspection])

  // ── Reset ─────────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    clearPoll()
    setInspection(null); setStarting(false); setUploading(false)
    setUploadPct(0); setError(null)
  }, [])

  return { inspection, starting, uploading, uploadPct, error, start, uploadFile, complete, reset }
}
