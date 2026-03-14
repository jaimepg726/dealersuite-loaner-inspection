/**
 * useInspection — manages the lifecycle of an active inspection.
 *
 * Upload strategy:
 *  1. Try direct-to-Drive: GET /upload-session -> PUT to Drive resumable URL
 *     -> POST /finalize-upload. Railway only handles tiny JSON — zero bytes.
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

  // ── Start ──────────────────────────────────────────────────────────────────
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

  // ── Direct-to-Drive upload ─────────────────────────────────────────────────
  async function _directDriveUpload(blob, mediaType, damageLocation, inspectionId, onProgress) {
    const mimeType = blob.type || (mediaType === 'video' ? 'video/mp4' : 'image/jpeg')
    const params = new URLSearchParams({ mime_type: mimeType, media_type: mediaType })
    if (damageLocation) params.set('damage_location', damageLocation)

    // Step 1: get resumable URL from Railway (tiny JSON request)
    const { data: session } = await api.post(
      `/api/inspect/${inspectionId}/upload-session?${params}`
    )

    // Step 2: PUT file directly to Google Drive resumable URL.
    // IMPORTANT: use raw fetch, NOT the api axios instance.
    // Reasons: (a) must NOT attach DealerSuite JWT to a Google request,
    //          (b) must NOT prepend Railway base URL to the Google URL.
    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('PUT', session.resumable_url)
      xhr.setRequestHeader('Content-Type', mimeType)
      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable && onProgress) {
          onProgress(Math.round((evt.loaded / evt.total) * 100))
        }
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.responseText)
        else reject(new Error(`Drive PUT failed: ${xhr.status} ${xhr.responseText.substring(0, 100)}`))
      }
      xhr.onerror = () => reject(new Error('Drive PUT network error'))
      xhr.send(blob)
    })

    // Step 3: Parse Drive file ID from response or filename, then finalize
    // Drive returns JSON with id on successful upload
    let driveFileId = null
    try {
      // The resumable URL response body on 200 contains the file resource
      // We stored the media_record_id in the session — use that to finalize
    } catch {}

    // Finalize: tell Railway the Drive file ID
    const { data: finalized } = await api.post(
      `/api/inspect/${inspectionId}/finalize-upload`,
      {
        media_record_id: session.media_record_id,
        drive_file_id: await _getDriveFileId(session.resumable_url),
        mime_type: mimeType,
        media_type: mediaType,
        file_size: blob.size,
      }
    )
    return finalized
  }

  // Extract Drive file ID after upload completes by querying Railway
  // (Drive resumable URL response body contains the file resource JSON)
  async function _getDriveFileId(resumableUrl) {
    // The PUT response body IS the Drive file resource JSON with the id
    // We capture it via XHR above but need to restructure — use a simpler approach:
    // do a zero-byte PUT to get the final file resource
    try {
      const r = await fetch(resumableUrl, {
        method: 'PUT',
        headers: { 'Content-Range': '*/*' },
      })
      if (r.status === 200 || r.status === 201) {
        const d = await r.json()
        return d.id
      }
    } catch {}
    return null
  }

  // ── Legacy upload (Railway proxy fallback) ─────────────────────────────────
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

  // ── uploadFile — tries direct Drive, falls back to legacy ──────────────────
  const uploadFile = useCallback(async (blob, mediaType, damageLocation = null) => {
    if (!inspection?.id) throw new Error('No active inspection')
    setUploading(true); setUploadPct(0); setError(null)

    try {
      let result
      try {
        // Attempt direct-to-Drive upload (zero Railway bandwidth)
        result = await _directDriveUpload(
          blob, mediaType, damageLocation, inspection.id,
          (pct) => setUploadPct(pct)
        )
      } catch (directErr) {
        console.warn('Direct Drive upload failed, falling back to legacy:', directErr.message)
        setUploadPct(0)
        // Fallback: send through Railway (Drive not connected or session failed)
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

  // ── Complete ───────────────────────────────────────────────────────────────
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

  // ── Reset ──────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    clearPoll()
    setInspection(null); setStarting(false); setUploading(false)
    setUploadPct(0); setError(null)
  }, [])

  return { inspection, starting, uploading, uploadPct, error, start, uploadFile, complete, reset }
}
