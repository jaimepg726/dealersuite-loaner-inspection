/**
 * useInspection — manages the lifecycle of an active inspection.
 *
 * Usage:
 *   const { inspection, starting, error, start, complete, uploadFile } = useInspection()
 *
 * Flow:
 *   1. call start(vehicleId, type)         → POSTs /api/inspect/start
 *   2. Drive folder is created in background; poll until drive_folder_id appears
 *   3. call uploadFile(blob, 'video'|'photo', location?) → POSTs /api/inspect/{id}/upload
 *   4. call complete(photoCount, notes)    → POSTs /api/inspect/{id}/complete
 */

import { useState, useRef, useCallback } from 'react'
import api from '../utils/api'

const POLL_INTERVAL_MS = 2500   // check for Drive folder every 2.5 s
const POLL_MAX_TRIES   = 12     // give up after ~30 s

export default function useInspection() {
  const [inspection, setInspection] = useState(null)  // full InspectionResponse
  const [starting,   setStarting]   = useState(false)
  const [uploading,  setUploading]  = useState(false)
  const [uploadPct,  setUploadPct]  = useState(0)
  const [error,      setError]      = useState(null)

  const pollRef = useRef(null)

  // ── Helpers ────────────────────────────────────────────────────────────────

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

  // ── Poll for Drive folder ──────────────────────────────────────────────────

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
          // Stop polling but don't block — Drive may just not be configured
          console.warn('Drive folder not ready after polling — Drive may be disabled')
        }
      } catch (err) {
        clearPoll()
        console.error('Poll error:', err)
      }
    }, POLL_INTERVAL_MS)
  }

  // ── Start ──────────────────────────────────────────────────────────────────

  const start = useCallback(async (vehicleId, type) => {
    setStarting(true)
    setError(null)
    try {
      const { data } = await api.post('/api/inspect/start', {
        vehicle_id:      vehicleId,
        inspection_type: type,
      })
      setInspection(data)

      // If Drive folder not yet created, poll until it is
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

  // ── Upload ─────────────────────────────────────────────────────────────────

  const uploadFile = useCallback(async (
    blob,
    mediaType,              // 'video' | 'photo'
    damageLocation = null,  // required for photos
  ) => {
    if (!inspection?.id) throw new Error('No active inspection')

    setUploading(true)
    setUploadPct(0)
    setError(null)

    try {
      const form = new FormData()
      const ext  = mediaType === 'video' ? 'mp4' : 'jpg'
      form.append('file', blob, `${mediaType}.${ext}`)

      const params = new URLSearchParams({ media_type: mediaType })
      if (damageLocation) params.set('damage_location', damageLocation)

      const { data } = await api.post(
        `/api/inspect/${inspection.id}/upload?${params}`,
        form,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (evt) => {
            if (evt.total) {
              setUploadPct(Math.round((evt.loaded * 100) / evt.total))
            }
          },
        },
      )

      // Refresh inspection to get updated video_url
      const updated = await fetchInspection(inspection.id)
      setInspection(updated)

      return data   // { file_id, file_url, filename, bytes_uploaded }
    } catch (err) {
      const msg = err.response?.data?.detail || 'Upload failed'
      setError(msg)
      throw err
    } finally {
      setUploading(false)
      setUploadPct(0)
    }
  }, [inspection])

  // ── Complete ───────────────────────────────────────────────────────────────

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
  }, [inspection])

  // ── Reset ──────────────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    clearPoll()
    setInspection(null)
    setStarting(false)
    setUploading(false)
    setUploadPct(0)
    setError(null)
  }, [])

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
