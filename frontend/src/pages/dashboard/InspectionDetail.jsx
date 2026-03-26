/**
 * DealerSuite - Inspection Detail Page
 *
 * Visual polish pass:
 *   - VideoPlayer constrained to max-w-sm inside a featured media card
 *   - MediaGallery: video wrapped in card container with icon header
 *   - PhotoThumb: rounded-xl for consistency
 *   - Summary card: colored left accent stripe per inspection type
 *   - Damage items: refined compact cards with yellow left accent
 */
import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Camera, Video, AlertTriangle,
  X, Loader, WifiOff, ChevronLeft, ChevronRight,
} from 'lucide-react'
import api from '../../utils/api'
import AuthDriveImage, { isDriveUrl, fetchDriveBlob } from '../../components/ui/AuthDriveImage'

// ── PhotoThumb ────────────────────────────────────────────────────────────────
function PhotoThumb({ m, onOpen }) {
  const [src,     setSrc]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)
  const objUrlRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    setSrc(null)

    if (isDriveUrl(m.file_url)) {
      fetchDriveBlob(m.id)
        .then(({ objectUrl }) => {
          if (cancelled) { URL.revokeObjectURL(objectUrl); return }
          objUrlRef.current = objectUrl
          setSrc(objectUrl)
          setLoading(false)
        })
        .catch(() => {
          if (!cancelled) { setError(true); setLoading(false) }
        })
    } else {
      setSrc(m.file_url)
      setLoading(false)
    }

    return () => {
      cancelled = true
      if (objUrlRef.current) { URL.revokeObjectURL(objUrlRef.current); objUrlRef.current = null }
    }
  }, [m.id, m.file_url])

  return (
    <button
      onClick={() => src && onOpen()}
      disabled={!src}
      className="aspect-square rounded-xl overflow-hidden bg-brand-mid border border-brand-accent
                 hover:border-brand-blue/60 transition-colors relative disabled:cursor-default"
    >
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-brand-mid">
          <Loader className="w-4 h-4 text-brand-blue animate-spin" />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-brand-mid">
          <WifiOff className="w-4 h-4 text-gray-500" />
        </div>
      )}
      {src && !error && (
        <img src={src} alt="Inspection photo" className="w-full h-full object-cover" />
      )}
    </button>
  )
}

// ── PhotoModal ────────────────────────────────────────────────────────────────
function PhotoModal({ photos, startIdx, onClose }) {
  const [current, setCurrent] = useState(startIdx)
  const [src,     setSrc]     = useState(null)
  const [loading, setLoading] = useState(false)
  const objUrlRef = useRef(null)

  useEffect(() => {
    const m = photos[current]
    if (!m) return

    let cancelled = false
    if (objUrlRef.current) { URL.revokeObjectURL(objUrlRef.current); objUrlRef.current = null }
    setSrc(null)

    if (isDriveUrl(m.file_url)) {
      setLoading(true)
      fetchDriveBlob(m.id)
        .then(({ objectUrl }) => {
          if (cancelled) { URL.revokeObjectURL(objectUrl); return }
          objUrlRef.current = objectUrl
          setSrc(objectUrl)
          setLoading(false)
        })
        .catch(() => { if (!cancelled) setLoading(false) })
    } else {
      setSrc(m.file_url)
    }

    return () => {
      cancelled = true
      if (objUrlRef.current) { URL.revokeObjectURL(objUrlRef.current); objUrlRef.current = null }
    }
  }, [current]) // eslint-disable-line react-hooks/exhaustive-deps

  const hasPrev = current > 0
  const hasNext = current < photos.length - 1

  return (
    <div
      className="fixed inset-0 z-50 bg-black/92 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <button
        className="absolute top-4 right-4 w-10 h-10 bg-brand-mid rounded-full
                   flex items-center justify-center z-10 border border-brand-accent"
        onClick={onClose}
        aria-label="Close"
      >
        <X className="w-5 h-5 text-gray-300" />
      </button>

      {hasPrev && (
        <button
          className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/60 rounded-full
                     flex items-center justify-center z-10 border border-white/10"
          onClick={(e) => { e.stopPropagation(); setCurrent((c) => c - 1) }}
          aria-label="Previous photo"
        >
          <ChevronLeft className="w-6 h-6 text-white" />
        </button>
      )}

      {hasNext && (
        <button
          className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/60 rounded-full
                     flex items-center justify-center z-10 border border-white/10"
          onClick={(e) => { e.stopPropagation(); setCurrent((c) => c + 1) }}
          aria-label="Next photo"
        >
          <ChevronRight className="w-6 h-6 text-white" />
        </button>
      )}

      <div
        className="flex flex-col items-center gap-3 max-w-full max-h-full"
        onClick={(e) => e.stopPropagation()}
      >
        {loading && <Loader className="w-10 h-10 text-brand-blue animate-spin" />}
        {src && !loading && (
          <img
            src={src}
            alt={`Photo ${current + 1} of ${photos.length}`}
            className="max-w-full max-h-[80vh] rounded-xl object-contain shadow-2xl"
          />
        )}
        {photos.length > 1 && (
          <p className="text-gray-400 text-xs font-semibold bg-black/40 px-3 py-1 rounded-full">
            {current + 1} / {photos.length}
          </p>
        )}
      </div>
    </div>
  )
}

// ── VideoPlayer ───────────────────────────────────────────────────────────────
function VideoPlayer({ m }) {
  const [src,     setSrc]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)
  const objUrlRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    setSrc(null)

    if (isDriveUrl(m.file_url)) {
      fetchDriveBlob(m.id)
        .then(({ objectUrl }) => {
          if (cancelled) { URL.revokeObjectURL(objectUrl); return }
          objUrlRef.current = objectUrl
          setSrc(objectUrl)
          setLoading(false)
        })
        .catch(() => {
          if (!cancelled) { setError(true); setLoading(false) }
        })
    } else {
      setSrc(m.file_url)
      setLoading(false)
    }

    return () => {
      cancelled = true
      if (objUrlRef.current) { URL.revokeObjectURL(objUrlRef.current); objUrlRef.current = null }
    }
  }, [m.id, m.file_url])

  return (
    <div className="rounded-xl overflow-hidden bg-black border border-brand-accent relative aspect-video w-full">
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-brand-mid z-10">
          <Loader className="w-6 h-6 text-brand-blue animate-spin" />
          <span className="text-xs text-gray-500">Loading video…</span>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-gray-500">
          <WifiOff className="w-5 h-5" />
          <span className="text-sm">Could not load video</span>
        </div>
      )}
      {src && !error && (
        <video
          src={src}
          controls
          preload="metadata"
          className="w-full h-full object-contain"
          onLoadedMetadata={() => setLoading(false)}
        />
      )}
    </div>
  )
}

// ── MediaGallery ──────────────────────────────────────────────────────────────
function MediaGallery({ media, inspectionStatus }) {
  const [modal, setModal] = useState(null)

  const photos = media.filter((m) => m.media_type === 'photo')
  const videos = media.filter((m) => m.media_type === 'video')

  if (media.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center
                      bg-brand-mid/40 rounded-2xl border border-brand-accent">
        <Camera className="w-9 h-9 text-gray-600" strokeWidth={1.5} />
        <p className="text-gray-500 text-sm font-medium">
          {inspectionStatus === 'Completed'
            ? 'No media was uploaded for this inspection'
            : 'Media will appear here once the inspection is completed'}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">

      {/* ── Walkround Video — featured card ───────────────────────────── */}
      {videos.length > 0 && (
        <div className="rounded-2xl border border-brand-accent overflow-hidden bg-brand-dark/60">
          {/* Card header */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-brand-accent/60
                          bg-brand-mid/60">
            <Video className="w-3.5 h-3.5 text-brand-blue" />
            <span className="text-sm font-bold text-brand-white">
              {videos.length === 1 ? 'Walkround Video' : `Videos (${videos.length})`}
            </span>
          </div>
          {/* Video player(s) — constrained width so they feel intentional */}
          <div className="p-3 flex flex-col gap-3">
            {videos.map((m) => (
              <div key={m.id} className="max-w-sm mx-auto w-full">
                <VideoPlayer m={m} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Damage / Inspection Photos ────────────────────────────────── */}
      {photos.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Camera className="w-3.5 h-3.5 text-gray-500" />
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Photos ({photos.length})
            </span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
            {photos.map((m, i) => (
              <PhotoThumb
                key={m.id}
                m={m}
                onOpen={() => setModal({ idx: i })}
              />
            ))}
          </div>
        </div>
      )}

      {modal !== null && (
        <PhotoModal
          photos={photos}
          startIdx={modal.idx}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const TYPE_COLOR = {
  Checkout:  'bg-brand-blue/20 text-brand-blue',
  Checkin:   'bg-green-900/50 text-green-400',
  Inventory: 'bg-purple-900/50 text-purple-400',
  Sales:     'bg-orange-900/50 text-orange-400',
}

const TYPE_ACCENT = {
  Checkout:  'bg-brand-blue',
  Checkin:   'bg-green-500',
  Inventory: 'bg-purple-500',
  Sales:     'bg-orange-500',
}

const STATUS_COLOR = {
  Completed:    'text-green-400',
  'In Progress':'text-yellow-400',
  Failed:       'text-red-400',
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function InspectionDetail() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const [inspection, setInspection] = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const { data } = await api.get(`/api/manager/inspections/${id}`)
        setInspection(data)
      } catch (err) {
        setError(err.response?.data?.detail || 'Could not load inspection')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  if (loading) {
    return (
      <div className="p-5 flex flex-col gap-4">
        <div className="h-8 w-32 rounded-lg bg-brand-mid animate-pulse" />
        <div className="h-28 rounded-2xl bg-brand-mid animate-pulse" />
        <div className="h-44 rounded-2xl bg-brand-mid animate-pulse" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-5">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-400 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <p className="text-red-400 text-sm text-center py-8">{error}</p>
      </div>
    )
  }

  if (!inspection) return null

  const { vehicle, damages = [], media = [] } = inspection
  const typeCls    = TYPE_COLOR[inspection.inspection_type]  || TYPE_COLOR.Checkout
  const typeAccent = TYPE_ACCENT[inspection.inspection_type] || TYPE_ACCENT.Checkout
  const statusCls  = STATUS_COLOR[inspection.status]         || 'text-gray-400'

  return (
    <div className="flex flex-col pb-10">

      {/* Page header */}
      <div className="px-5 pt-5 pb-3 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 bg-brand-mid border border-brand-accent rounded-xl
                     flex items-center justify-center active:scale-95 transition-transform"
        >
          <ArrowLeft className="w-4 h-4 text-gray-400" />
        </button>
        <div>
          <h2 className="text-xl font-extrabold text-brand-white leading-tight">
            Inspection #{inspection.id}
          </h2>
          <p className="text-gray-500 text-xs">{formatDate(inspection.started_at)}</p>
        </div>
      </div>

      <div className="px-5 flex flex-col gap-5">

        {/* ── Summary card — with type accent stripe ──────────────────── */}
        <div className="bg-brand-mid rounded-2xl border border-brand-accent relative overflow-hidden">
          <div className={`absolute left-0 inset-y-0 w-1 ${typeAccent}`} />
          <div className="p-5 pl-6">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${typeCls}`}>
                {inspection.inspection_type}
              </span>
              <span className={`text-xs font-semibold ${statusCls}`}>
                ● {inspection.status}
              </span>
            </div>
            {vehicle ? (
              <p className="text-brand-white font-bold text-lg leading-tight">
                {vehicle.year} {vehicle.make} {vehicle.model}
                {vehicle.loaner_number && (
                  <span className="text-gray-500 font-normal text-sm ml-2">
                    #{vehicle.loaner_number}
                  </span>
                )}
              </p>
            ) : (
              <p className="text-gray-500 text-sm">Vehicle #{inspection.vehicle_id}</p>
            )}
            {inspection.inspector_name && (
              <p className="text-gray-400 text-sm mt-1.5">
                Inspector: <span className="text-gray-300">{inspection.inspector_name}</span>
              </p>
            )}
            {inspection.notes && (
              <p className="text-gray-400 text-sm mt-2 pt-2 border-t border-brand-accent">
                {inspection.notes}
              </p>
            )}
          </div>
        </div>

        {/* ── Damage notes ────────────────────────────────────────────── */}
        {damages.length > 0 && (
          <div>
            <h3 className="text-sm font-bold text-gray-300 mb-2.5 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-500" />
              Damage Notes ({damages.length})
            </h3>
            <div className="flex flex-col gap-2">
              {damages.map((d) => (
                <div
                  key={d.id}
                  className="bg-brand-mid rounded-xl border border-brand-accent relative overflow-hidden"
                >
                  {/* Yellow left accent on damage items */}
                  <div className="absolute left-0 inset-y-0 w-0.5 bg-yellow-500/70" />
                  <div className="p-3 pl-4 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-brand-white">{d.location}</p>
                      {d.photo_url && (
                        <span className="text-xs text-gray-500 flex items-center gap-1 shrink-0
                                         bg-brand-accent px-1.5 py-0.5 rounded-full">
                          <Camera className="w-3 h-3" /> photo
                        </span>
                      )}
                    </div>
                    {d.description && (
                      <p className="text-gray-400 text-xs mt-0.5">{d.description}</p>
                    )}
                    {d.repair_order && (
                      <p className="text-gray-500 text-xs mt-1 font-mono">RO #{d.repair_order}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Inspection media ────────────────────────────────────────── */}
        <div>
          <h3 className="text-sm font-bold text-gray-300 mb-3 flex items-center gap-2">
            <Camera className="w-4 h-4 text-brand-blue" />
            Inspection Media
          </h3>
          <MediaGallery media={media} inspectionStatus={inspection.status} />
        </div>

      </div>
    </div>
  )
}
