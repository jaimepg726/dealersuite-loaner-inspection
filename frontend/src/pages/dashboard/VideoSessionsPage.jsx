/**
 * VideoSessionsPage — Manager view of video recording session audit log.
 *
 * Shows all video recording attempts with their outcome status so managers
 * can identify patterns of incomplete, abandoned, or too-short sessions.
 *
 * Two sections:
 *   1. Session list — filterable by status and day range, paginated
 *   2. Per-porter stats — completion rate, avg duration, session counts
 */

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, RefreshCw, Video, AlertCircle,
  User, ChevronDown, ChevronUp,
} from 'lucide-react'
import api from '../../utils/api'

// ── Status display config ─────────────────────────────────────────────────────

const STATUS_CONFIG = {
  completed:        { label: 'Completed',        color: 'text-green-400',  bg: 'bg-green-500/10  border-green-500/20' },
  uploading:        { label: 'Uploading',         color: 'text-blue-400',   bg: 'bg-blue-500/10   border-blue-500/20'  },
  recording:        { label: 'Recording',         color: 'text-blue-400',   bg: 'bg-blue-500/10   border-blue-500/20'  },
  ready_for_upload: { label: 'Ready to Upload',   color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20'},
  stopped_short:    { label: 'Too Short',         color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20'},
  failed_upload:    { label: 'Upload Failed',     color: 'text-red-400',    bg: 'bg-red-500/10    border-red-500/20'  },
  closed_early:     { label: 'Closed Early',      color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20'},
  interrupted:      { label: 'Interrupted',       color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20'},
  abandoned:        { label: 'Abandoned',         color: 'text-gray-400',   bg: 'bg-gray-500/10   border-gray-500/20' },
  expired:          { label: 'Expired',           color: 'text-gray-400',   bg: 'bg-gray-500/10   border-gray-500/20' },
  started:          { label: 'Started',           color: 'text-gray-400',   bg: 'bg-gray-500/10   border-gray-500/20' },
}

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: 'text-gray-400', bg: 'bg-gray-500/10 border-gray-500/20' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${cfg.color} ${cfg.bg}`}>
      {cfg.label}
    </span>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDuration(secs) {
  if (secs == null) return '—'
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function fmtDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

// ── Session card ──────────────────────────────────────────────────────────────

function SessionCard({ session }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="card flex flex-col gap-0 p-0 overflow-hidden">
      {/* Main row */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-start gap-3 px-4 py-3 text-left active:bg-brand-accent/30 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={session.status} />
            {session.min_duration_met === false && session.duration_seconds != null && (
              <span className="text-xs text-orange-400 font-semibold">
                {fmtDuration(session.duration_seconds)}
              </span>
            )}
            {session.min_duration_met === true && session.duration_seconds != null && (
              <span className="text-xs text-gray-500">
                {fmtDuration(session.duration_seconds)}
              </span>
            )}
          </div>
          <p className="text-brand-white font-semibold text-sm mt-1 truncate">
            {session.inspector_name || 'Unknown porter'}
          </p>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {session.loaner_number && (
              <span className="text-gray-500 text-xs">#{session.loaner_number}</span>
            )}
            {session.inspection_type && (
              <span className="text-gray-500 text-xs capitalize">{session.inspection_type}</span>
            )}
            <span className="text-gray-600 text-xs">{fmtDateTime(session.created_at)}</span>
          </div>
        </div>
        {expanded
          ? <ChevronUp className="w-4 h-4 text-gray-500 mt-1 shrink-0" />
          : <ChevronDown className="w-4 h-4 text-gray-500 mt-1 shrink-0" />
        }
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-brand-accent px-4 py-3 flex flex-col gap-2 bg-brand-accent/20">
          {session.inspection_id    != null && <DetailRow label="Inspection ID"    value={session.inspection_id} />}
          {session.last_known_phase          && <DetailRow label="Phase at stop"   value={session.last_known_phase} />}
          {session.min_duration_required != null && (
            <DetailRow label="Min duration" value={`${session.min_duration_required}s`} />
          )}
          {session.recording_started_at      && <DetailRow label="Recording started" value={fmtDateTime(session.recording_started_at)} />}
          {session.recording_stopped_at      && <DetailRow label="Recording stopped" value={fmtDateTime(session.recording_stopped_at)} />}
          {session.upload_started_at         && <DetailRow label="Upload started"    value={fmtDateTime(session.upload_started_at)} />}
          {session.upload_finished_at        && <DetailRow label="Upload finished"   value={fmtDateTime(session.upload_finished_at)} />}
          {session.interruption_type         && <DetailRow label="Interruption"      value={session.interruption_type} warn />}
          {session.app_backgrounded          && <DetailRow label="App backgrounded"  value="Yes" warn />}
          {session.app_unloaded              && <DetailRow label="App closed"         value="Yes" warn />}
          {session.failure_reason            && <DetailRow label="Reason"            value={session.failure_reason} warn />}
          {/* Fallback: show created time if nothing else is worth showing */}
          {!session.recording_started_at && !session.failure_reason && (
            <DetailRow label="Created" value={fmtDateTime(session.created_at)} />
          )}
        </div>
      )}
    </div>
  )
}

function DetailRow({ label, value, warn = false }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-gray-500 text-xs shrink-0">{label}</span>
      <span className={`text-xs font-semibold text-right ${warn ? 'text-yellow-400' : 'text-brand-white'}`}>
        {String(value)}
      </span>
    </div>
  )
}

// ── Per-porter stats table ────────────────────────────────────────────────────

function PorterStatsSection({ days }) {
  const [stats,   setStats]   = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get(`/api/manager/video-sessions/stats?days=${days}`)
      setStats(data)
    } catch {
      setStats(null)
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="card h-24 animate-pulse bg-brand-mid" />
  if (!stats?.porter_stats?.length) return (
    <div className="card text-gray-500 text-sm text-center py-6">No data for this period</div>
  )

  return (
    <div className="card flex flex-col gap-0 p-0 overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-4 gap-0 px-4 py-2 border-b border-brand-accent bg-brand-accent/30">
        <span className="text-xs font-bold text-gray-500 col-span-2">Porter</span>
        <span className="text-xs font-bold text-gray-500 text-center">Complete %</span>
        <span className="text-xs font-bold text-gray-500 text-right">Sessions</span>
      </div>
      {stats.porter_stats.map((row, i) => (
        <div key={i} className="grid grid-cols-4 gap-0 px-4 py-2.5 border-b border-brand-accent/50 last:border-0">
          <div className="col-span-2 min-w-0">
            <p className="text-brand-white text-sm font-semibold truncate">{row.inspector_name || 'Unknown'}</p>
            <p className="text-gray-600 text-xs">{fmtDuration(row.avg_duration_seconds)} avg</p>
          </div>
          <div className="flex items-center justify-center">
            <span className={`text-sm font-bold ${
              row.completion_rate_pct >= 90 ? 'text-green-400'
              : row.completion_rate_pct >= 70 ? 'text-yellow-400'
              : 'text-red-400'
            }`}>
              {row.completion_rate_pct}%
            </span>
          </div>
          <div className="flex flex-col items-end justify-center">
            <span className="text-brand-white text-sm font-bold">{row.total}</span>
            {row.incomplete > 0 && (
              <span className="text-orange-400 text-xs">{row.incomplete} incomplete</span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Filter chips ──────────────────────────────────────────────────────────────

const STATUS_FILTERS = [
  { value: '',               label: 'All'          },
  { value: 'completed',      label: 'Completed'    },
  { value: 'incomplete',     label: 'Problems'     },
  { value: 'stopped_short',  label: 'Too Short'    },
  { value: 'failed_upload',  label: 'Upload Failed'},
  { value: 'interrupted',    label: 'Interrupted'  },
  { value: 'closed_early',   label: 'Closed Early' },
  { value: 'abandoned',      label: 'Abandoned'    },
]

const DAY_OPTIONS = [
  { value: 1,  label: 'Today'   },
  { value: 7,  label: '7 days'  },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
]

// ── Main page ─────────────────────────────────────────────────────────────────

export default function VideoSessionsPage() {
  const navigate = useNavigate()

  const [sessions,    setSessions]    = useState([])
  const [total,       setTotal]       = useState(0)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [days,        setDays]        = useState(7)
  const [skip,        setSkip]        = useState(0)
  const [showStats,   setShowStats]   = useState(false)

  const LIMIT = 25

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ days, skip, limit: LIMIT })
      if (statusFilter) params.set('status', statusFilter)
      const { data } = await api.get(`/api/manager/video-sessions?${params}`)
      setSessions(data.sessions)
      setTotal(data.total)
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not load sessions')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, days, skip])

  useEffect(() => { load() }, [load])

  // Reset pagination when filters change
  useEffect(() => { setSkip(0) }, [statusFilter, days])

  const totalPages = Math.ceil(total / LIMIT)
  const currentPage = Math.floor(skip / LIMIT) + 1

  return (
    <div className="flex flex-col pb-10">
      {/* Header */}
      <div className="px-5 pt-5 pb-3 flex items-center gap-3">
        <button
          onClick={() => navigate('/dashboard/settings')}
          className="w-9 h-9 bg-brand-mid border border-brand-accent rounded-xl
                     flex items-center justify-center active:scale-95 transition-transform shrink-0"
        >
          <ArrowLeft className="w-4 h-4 text-gray-400" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-extrabold text-brand-white leading-tight">Video Sessions</h2>
          <p className="text-gray-500 text-xs">Recording attempt audit log</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="w-9 h-9 bg-brand-mid border border-brand-accent rounded-xl
                     flex items-center justify-center active:scale-95 transition-transform
                     disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={`w-4 h-4 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="px-5 flex flex-col gap-4">

        {/* Day range chips */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {DAY_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setDays(opt.value)}
              className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors
                ${days === opt.value
                  ? 'bg-brand-blue border-brand-blue text-white'
                  : 'bg-brand-mid border-brand-accent text-gray-400'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Status filter chips */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {STATUS_FILTERS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors
                ${statusFilter === opt.value
                  ? 'bg-brand-blue border-brand-blue text-white'
                  : 'bg-brand-mid border-brand-accent text-gray-400'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Session count */}
        {!loading && !error && (
          <p className="text-gray-500 text-xs">
            {total} session{total !== 1 ? 's' : ''} found
          </p>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="flex flex-col gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="card h-20 animate-pulse bg-brand-mid" />
            ))}
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="card flex items-center gap-3 text-red-400 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0" />
            {error}
          </div>
        )}

        {/* Empty */}
        {!loading && !error && sessions.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Video className="w-12 h-12 text-brand-accent" strokeWidth={1} />
            <p className="text-gray-400 font-semibold">No sessions found</p>
            <p className="text-gray-600 text-sm">Try a different filter or time range</p>
          </div>
        )}

        {/* Session list */}
        {!loading && !error && sessions.length > 0 && (
          <div className="flex flex-col gap-3">
            {sessions.map(s => (
              <SessionCard key={s.uuid} session={s} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => setSkip(Math.max(0, skip - LIMIT))}
              disabled={skip === 0 || loading}
              className="px-4 py-2 bg-brand-mid border border-brand-accent rounded-xl text-sm font-bold text-gray-400
                         disabled:opacity-40 active:scale-95 transition-transform"
            >
              Previous
            </button>
            <span className="text-gray-500 text-xs">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setSkip(skip + LIMIT)}
              disabled={skip + LIMIT >= total || loading}
              className="px-4 py-2 bg-brand-mid border border-brand-accent rounded-xl text-sm font-bold text-gray-400
                         disabled:opacity-40 active:scale-95 transition-transform"
            >
              Next
            </button>
          </div>
        )}

        {/* Per-porter stats toggle */}
        <button
          onClick={() => setShowStats(s => !s)}
          className="flex items-center gap-2 text-gray-500 text-sm font-semibold py-1"
        >
          <User className="w-4 h-4" />
          Porter Stats
          {showStats
            ? <ChevronUp className="w-4 h-4" />
            : <ChevronDown className="w-4 h-4" />
          }
        </button>

        {showStats && <PorterStatsSection days={days} />}
      </div>
    </div>
  )
}
