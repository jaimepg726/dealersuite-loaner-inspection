/**
 * useVideoSession — session lifecycle tracker for video recording/upload.
 *
 * Tracks each recording attempt so managers can see failed, abandoned,
 * interrupted, or too-short sessions in the dashboard.
 *
 * Design principles:
 *   • ALL API calls are fire-and-forget — never throws, never blocks inspection flow.
 *   • Heartbeat runs every 5s while recording or uploading.
 *   • visibilitychange and pagehide are tracked via keepalive fetch (works on unload).
 *   • Once a session reaches a terminal status it is never downgraded.
 *
 * Usage:
 *   const session = useVideoSession()
 *   session.createSession({ inspectorName, loanerNumber, inspectionType })
 *   session.markRecordingStarted()
 *   session.markRecordingStopped(durationSeconds, inspectionType)
 *   session.markInspectionCreated(inspectionId)
 *   session.markUploadStarted()
 *   session.markUploadComplete()
 *   session.markUploadFailed(reason)
 */

import { useRef, useCallback, useEffect } from 'react'
import api from '../utils/api'
import { MIN_DURATION_BY_TYPE } from '../config/walkroundSteps'

const HEARTBEAT_MS     = 5_000
const TERMINAL_STATUSES = new Set([
  'completed', 'failed_upload', 'abandoned',
  'closed_early', 'interrupted', 'expired',
])

export default function useVideoSession() {
  const uuidRef      = useRef(null)   // backend session UUID
  const phaseRef     = useRef('started')
  const activeRef    = useRef(false)  // true while recording/uploading
  const heartbeatRef = useRef(null)
  const cleanupRef   = useRef(null)   // removes event listeners

  // Clean up on unmount
  useEffect(() => {
    return () => {
      _stopHeartbeat()
      _removeListeners()
    }
  }, [])

  // ── Internal helpers ──────────────────────────────────────────────────────

  function _stopHeartbeat() {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current)
      heartbeatRef.current = null
    }
  }

  function _removeListeners() {
    if (cleanupRef.current) {
      cleanupRef.current()
      cleanupRef.current = null
    }
  }

  /** Silent PATCH — never throws. */
  async function _patch(updates) {
    const uuid = uuidRef.current
    if (!uuid) return
    try { await api.patch(`/api/sessions/${uuid}`, updates) } catch {}
  }

  /**
   * Fire-and-forget beacon for pagehide / visibility loss.
   * Uses keepalive:true so the request survives page teardown.
   * Authorization header included via Bearer token from localStorage.
   * Token also passed as ?token= in case the header is stripped.
   */
  function _beacon(updates) {
    const uuid = uuidRef.current
    if (!uuid) return
    const token = localStorage.getItem('ds_token') || ''
    try {
      fetch(`/api/sessions/${uuid}/beacon?token=${encodeURIComponent(token)}`, {
        method:    'POST',
        keepalive: true,
        headers:   {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(updates),
      })
    } catch {}
  }

  function _startHeartbeat(phase) {
    _stopHeartbeat()
    phaseRef.current = phase
    heartbeatRef.current = setInterval(() => {
      const uuid = uuidRef.current
      if (!uuid) return
      try { api.post(`/api/sessions/${uuid}/heartbeat`, { phase }) } catch {}
    }, HEARTBEAT_MS)
  }

  /**
   * Sets up visibilitychange and pagehide listeners.
   * Returns a cleanup function.
   */
  function _setupListeners() {
    const onVisibility = () => {
      if (document.hidden && activeRef.current) {
        _beacon({
          app_backgrounded: true,
          interruption_type: 'visibility',
          last_known_phase: phaseRef.current,
        })
      }
    }

    const onPageHide = () => {
      if (!activeRef.current) return
      _beacon({
        status:           'closed_early',
        app_unloaded:      true,
        interruption_type: 'pagehide',
        last_known_phase:  phaseRef.current,
        failure_reason:    'App closed or navigated away while session was active',
      })
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Call once when the recording page mounts (or as early as possible).
   * Creates the backend session record.
   */
  const createSession = useCallback(async ({
    inspectorName,
    loanerNumber,
    inspectionType,
    inspectionId = null,
  }) => {
    const minDuration = MIN_DURATION_BY_TYPE[inspectionType?.toLowerCase()] ?? 72
    try {
      const { data } = await api.post('/api/sessions', {
        inspector_name:        inspectorName,
        loaner_number:         loanerNumber,
        inspection_type:       inspectionType,
        inspection_id:         inspectionId,
        min_duration_required: minDuration,
      })
      uuidRef.current  = data.uuid
      activeRef.current = true
      cleanupRef.current = _setupListeners()
    } catch {}
  }, [])

  /** Call when the porter taps "Start Recording". */
  const markRecordingStarted = useCallback(() => {
    activeRef.current = true
    phaseRef.current  = 'recording'
    _startHeartbeat('recording')
    _patch({
      status:              'recording',
      last_known_phase:    'recording',
      recording_started_at: new Date().toISOString(),
    })
  }, [])

  /**
   * Call when recording stops (porter taps Stop, before preview).
   * Checks minimum duration and marks stopped_short if below threshold.
   */
  const markRecordingStopped = useCallback((durationSeconds, inspectionType) => {
    _stopHeartbeat()
    const minDuration = MIN_DURATION_BY_TYPE[inspectionType?.toLowerCase()] ?? 72
    const minMet      = typeof durationSeconds === 'number' && durationSeconds >= minDuration
    const newStatus   = minMet ? 'ready_for_upload' : 'stopped_short'
    phaseRef.current  = newStatus

    _patch({
      status:              newStatus,
      last_known_phase:    newStatus,
      duration_seconds:    durationSeconds,
      min_duration_met:    minMet,
      recording_stopped_at: new Date().toISOString(),
      ...(!minMet && durationSeconds != null
        ? { failure_reason: `Recording ${Math.round(durationSeconds)}s — minimum ${minDuration}s required` }
        : {}),
    })
  }, [])

  /** Call after the inspection DB row is created (has a real ID). */
  const markInspectionCreated = useCallback((inspectionId) => {
    _patch({ inspection_id: inspectionId })
  }, [])

  /** Call when the upload phase begins. */
  const markUploadStarted = useCallback(() => {
    activeRef.current = true
    phaseRef.current  = 'uploading'
    _startHeartbeat('uploading')
    _patch({
      status:            'uploading',
      last_known_phase:  'uploading',
      upload_started:    true,
      upload_started_at: new Date().toISOString(),
    })
  }, [])

  /** Call when all uploads and the complete step succeed. */
  const markUploadComplete = useCallback(() => {
    activeRef.current = false
    _stopHeartbeat()
    _removeListeners()
    phaseRef.current = 'completed'
    _patch({
      status:            'completed',
      last_known_phase:  'completed',
      upload_finalized:  true,
      upload_finished_at: new Date().toISOString(),
    })
  }, [])

  /** Call on upload error, finalize failure, or any fatal upload issue. */
  const markUploadFailed = useCallback((reason) => {
    activeRef.current = false
    _stopHeartbeat()
    _removeListeners()
    phaseRef.current = 'failed_upload'
    _patch({
      status:           'failed_upload',
      last_known_phase: 'failed_upload',
      failure_reason:   reason || 'Upload failed',
    })
  }, [])

  return {
    createSession,
    markRecordingStarted,
    markRecordingStopped,
    markInspectionCreated,
    markUploadStarted,
    markUploadComplete,
    markUploadFailed,
  }
}
