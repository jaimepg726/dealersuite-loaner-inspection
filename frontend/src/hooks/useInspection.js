/**
 * useInspection — manages the lifecycle of an active inspection.
 *
 * Direct-to-Drive upload architecture:
 *   1. call start(vehicleId, type)         → POSTs /api/inspect/start
 *   2. call uploadFile(blob, type, loc?)
 *        a. Compress image via Canvas API (photos only)
 *        b. POST /api/inspect/{id}/upload-session → { upload_url, filename }
 *        c. PUT blob directly to Drive resumable URL (browser → Drive, zero backend RAM)
 *        d. POST /api/inspect/{id}/media with file metadata
 *        e. On failure: enqueue in IndexedDB for later retry
 *   3. call complete(photoCount, notes)    → POSTs /api/inspect/{id}/complete
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import axios from 'axios'
import api from '../utils/api'
import {
  compressImage,
  enqueueMedia,
  startQueueFlusher,
  stopQueueFlusher,
} from '../utils/mediaQueue'

const POLL_INTERVAL_MS = 2500
const POLL_MAX_TRIES   = 12

const DRIVE_FILE_URL = (id) => `https://drive.google.com/uc?id=${id}&export=view`

export default function useInspection() {
  const [inspection, setInspection] = useState(null)
  const [starting,   setStarting]   = useState(false)
  const [uploading,  setUploading]  = useState(false)
  const [uploadPct,  setUploadPct]  = useState(0)
  const [error,      setError]      = useState(null)

  const pollRef       = useRef(null)
  const inspectionRef = useRef(null)   // stable ref for queue flusher closure

  // Keep ref in sync with state
  useEffect(() => { inspectionRef.current = inspection }, [inspection])

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function clearPoll() {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  async function fetchInspection(id) {
    const { data } = await api.get(`/api/inspect/${id}`)
    return data
  }

  // ── Poll for Drive folder ─────────────────────────────────────────────────

  function startPollingForFolder(id) {
    let tries = 0
    clearPoll()
    pollRef.current = setInterval(async () => {
      tries++
      try {
        const data = await fetchInspection(id)
        if (data.drive_folder_id) {
          setInspection(data)
          clearPoll()
        } else if (tries >= POLL_MAX_TRIES) {
          clearPoll()
          console.warn('Drive folder not ready after polling — Drive may be disabled')
        }
      } catch (err) {
        clearPoll()
        console.error('Poll error:', err)
      }
    }, POLL_INTERVAL_MS)
  }

  // ── Direct Drive upload ───────────────────────────────────────────────────

  async function _uploadToDrive(inspectionId, blob, mediaType, damageLocation) {
    const mimeType = blob.type || (mediaType === 'video' ? 'video/mp4' : 'image/jpeg')

    // Phase A — compress image before upload (Canvas API — no backend cost)
    const finalBlob = mediaType === 'photo'
      ? await compressImage(blob, { maxDimension: 1920, quality: 0.82 })
      : blob

    // Phase A — request a Drive resumable upload session URL from the backend
    const { data: session } = await api.post(
      `/api/inspect/${inspectionId}/upload-session`,
      {
        mimetype:        mimeType,
        media_type:      mediaType,
        damage_location: damageLocation || null,
      },
    )

    const { upload_url: uploadUrl, filename } = session

    // Phase B — PUT bytes directly to Drive via axios so onUploadProgress fires
    // (the backend receives ZERO bytes of media payload)
    const driveResp = await axios.put(uploadUrl, finalBlob, {
      headers: { 'Content-Type': mimeType },
      onUploadProgress: (evt) => {
        if (evt.total) {
          setUploadPct(Math.round((evt.loaded / evt.total) * 100))
        }
      },
    })

    const driveFileId = driveResp.data?.id
    if (!driveFileId) {
      throw new Error('Drive did not return a file ID after upload')
    }

    // Phase C — persist metadata in Railway via the finalize-upload endpoint
    const { data: meta } = await api.post(`/api/inspect/${inspectionId}/finalize-upload`, {
      drive_file_id: driveFileId,
      mime_type:     mimeType,
      media_type:    mediaType,
      file_size:     finalBlob.size,
    })

    const fileUrl = DRIVE_FILE_URL(driveFileId)
    return { file_id: String(meta.id), file_url: fileUrl, filename }
  }

  // ── Start ─────────────────────────────────────────────────────────────────

  const start = useCallback(async (vehicleId, type) => {
    setStarting(true)
    setError(null)
    try {
      const { data } = await api.post('/api/inspect/start', {
        vehicle_id:      vehicleId,
        inspection_type: type,
      })
      setInspection(data)
      if (!data.drive_folder_id) {
        startPollingForFolder(data.id)
      }
      return data
    } catch (err) {
      const msg = err.response?.data?.detail || 'Could not start inspection'
      setError(msg)
      throw err
    } finally {
      setStarting(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Upload ────────────────────────────────────────────────────────────────

  const uploadFile = useCallback(async (
    blob,
    mediaType,
    damageLocation = null,
  ) => {
    if (!inspection?.id) throw new Error('No active inspection')
    const inspectionId = inspection.id

    setUploading(true)
    setUploadPct(0)
    setError(null)

    try {
      const result = await _uploadToDrive(inspectionId, blob, mediaType, damageLocation)
      setUploadPct(100)
      return result
    } catch (err) {
      // On failure, queue in IndexedDB for offline retry
      console.warn('Drive upload failed — queuing for retry:', err)
      try {
        await enqueueMedia({
          inspectionId,
          blob,
          mediaType,
          mimeType:      blob.type || '',
          damageLocation,
        })
        console.info('[mediaQueue] item enqueued for retry')
      } catch (qErr) {
        console.error('[mediaQueue] failed to enqueue:', qErr)
      }
      // Re-throw so callers can handle gracefully (non-fatal in InspectPage)
      throw err
    } finally {
      setUploading(false)
      setUploadPct(0)
    }
  }, [inspection]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Complete ──────────────────────────────────────────────────────────────

  const complete = useCallback(async (photoCount = 0, notes = null) => {
    if (!inspection?.id) throw new Error('No active inspection')
    setError(null)
    try {
      const { data } = await api.post(`/api/inspect/${inspection.id}/complete`, {
        photo_count: photoCount,
        notes,
      })
      clearPoll()
      setInspection(data)
      return data
    } catch (err) {
      const msg = err.response?.data?.detail || 'Could not complete inspection'
      setError(msg)
      throw err
    }
  }, [inspection]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reset ─────────────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    clearPoll()
    stopQueueFlusher()
    setInspection(null)
    setStarting(false)
    setUploading(false)
    setUploadPct(0)
    setError(null)
  }, [])

  // ── Start queue flusher on mount ──────────────────────────────────────────

  useEffect(() => {
    // When the hook mounts, start the online listener so queued items
    // retry as soon as connectivity is restored.
    startQueueFlusher(async (item) => {
      const insp = inspectionRef.current
      if (!insp?.id) return
      await _uploadToDrive(
        item.inspectionId,
        item.blob,
        item.mediaType,
        item.damageLocation,
      )
    })
    return () => stopQueueFlusher()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    inspection,
    starting,
    uploading,
    uploadPct,
    error,
    start,
    uploadFile,
    complete,
    reset,
  }
}
