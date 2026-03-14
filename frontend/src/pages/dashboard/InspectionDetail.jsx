/**
 * DealerSuite - Inspection Detail Page
 * Media components updated to fetch Drive files directly from Google,
 * bypassing Railway entirely. Uses createObjectURL so <img>/<video> work
 * with authenticated Drive API requests.
 */
import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Camera, Video, AlertTriangle, X, Loader, WifiOff } from 'lucide-react'
import api from '../../utils/api'

/** Returns true if URL points to Google Drive */
function isDriveUrl(url) {
  return url && url.includes('drive.google.com')
}

/** Extract Drive file ID from any Drive URL format */
function extractDriveFileId(url) {
  if (!url) return null
  const m1 = url.match(/\/d\/([a-zA-Z0-9_-]+)/)
  if (m1) return m1[1]
  const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  if (m2) return m2[1]
  return null
}

/**
 * Fetch a Drive-backed media record directly from Google.
 * 1. GET /api/media/{id}/drive-token  (Railway — tiny JSON, no bytes)
 * 2. fetch(drive_url, Authorization header)  (browser → Google directly)
 * 3. createObjectURL(blob)
 * Railway never touches the media bytes.
 */
async function fetchDriveBlob(mediaId) {
  const { data } = await api.get(`/api/media/${mediaId}/drive-token`)
  // Use raw fetch — NOT the api instance — so we don't send the DealerSuite
  // JWT to Google and don't prepend the Railway base URL.
  const resp = await fetch(data.drive_url, {
    headers: { Authorization: `Bearer ${data.access_token}` }
  })
  if (!resp.ok) throw new Error(`Drive fetch failed: ${resp.status}`)
  const blob = await resp.blob()
  return { objectUrl: URL.createObjectURL(blob), mimeType: data.mime_type }
}

/** Single photo thumbnail — Drive or legacy DB */
function PhotoThumb({ m, onOpen }) {
  const [src, setSrc] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
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
      // Legacy DB record — plain src, no auth needed
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
      onClick={() => src && onOpen(src)}
      className="aspect-square rounded-lg overflow-hidden bg-brand-mid border border-brand-accent hover:border-brand-blue/60 transition-colors relative"
    >
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-brand-mid">
          <Loader className="w-5 h-5 text-brand-blue animate-spin" />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-brand-mid">
          <WifiOff className="w-5 h-5 text-gray-500" />
        </div>
      )}
      {src && !error && (
        <img
          src={src}
          alt="Inspection photo"
          className="w-full h-full object-cover"
          onLoad={() => setLoading(false)}
        />
      )}
    </button>
  )
}

/** Single video player — Drive or legacy DB */
function VideoPlayer({ m }) {
  const [src, setSrc] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
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
    <div className="rounded-xl overflow-hidden bg-brand-mid border border-brand-accent relative">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-brand-mid z-10 min-h-32">
          <div className="flex flex-col items-center gap-2">
            <Loader className="w-6 h-6 text-brand-blue animate-spin" />
            <span className="text-xs text-gray-500">Loading video…</span>
          </div>
        </div>
      )}
      {error && (
        <div className="flex items-center justify-center gap-2 py-8 text-gray-500">
          <WifiOff className="w-5 h-5" />
          <span className="text-sm">Could not load video</span>
        </div>
      )}
      {src && !error && (
        <video
          src={src}
          controls
          preload="metadata"
          className="w-full max-h-56 object-contain"
          onLoadedMetadata={() => setLoading(false)}
        />
      )}
    </div>
  )
}

function MediaGallery({ media }) {
  const [modalSrc, setModalSrc] = useState(null)
  const photos = media.filter((m) => m.media_type === 'photo')
  const videos = media.filter((m) => m.media_type === 'video')

  if (media.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <Camera className="w-10 h-10 text-brand-accent" strokeWidth={1} />
        <p className="text-gray-400 text-sm font-semibold">No photos or videos uploaded yet</p>
      </div>
    )
  }

  return (
    <>
      {photos.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
            Photos ({photos.length})
          </p>
          <div className="grid grid-cols-3 gap-2">
            {photos.map((m) => (
              <PhotoThumb key={m.id} m={m} onOpen={(s) => setModalSrc(s)} />
            ))}
          </div>
        </div>
      )}
      {videos.length > 0 && (
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
            Videos ({videos.length})
          </p>
          <div className="flex flex-col gap-3">
            {videos.map((m) => (
              <VideoPlayer key={m.id} m={m} />
            ))}
          </div>
        </div>
      )}
      {modalSrc && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setModalSrc(null)}
        >
          <button
            className="absolute top-4 right-4 w-10 h-10 bg-brand-mid rounded-full flex items-center justify-center"
            onClick={() => setModalSrc(null)}
          >
            <X className="w-5 h-5 text-gray-300" />
          </button>
          <img
            src={modalSrc}
            alt="Full size"
            className="max-w-full max-h-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}

const TYPE_COLOR = {
  Checkout:  'bg-brand-blue/20 text-brand-blue',
  Checkin:   'bg-green-900/50 text-green-400',
  Inventory: 'bg-purple-900/50 text-purple-400',
  Sales:     'bg-orange-900/50 text-orange-400',
}
const STATUS_COLOR = {
  Completed:   'text-green-400',
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

export default function InspectionDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [inspection, setInspection] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

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
        <div className="h-24 rounded-xl bg-brand-mid animate-pulse" />
        <div className="h-40 rounded-xl bg-brand-mid animate-pulse" />
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
  const typeCls = TYPE_COLOR[inspection.inspection_type] || TYPE_COLOR.Checkout
  const statusCls = STATUS_COLOR[inspection.status] || 'text-gray-400'

  return (
    <div className="flex flex-col pb-8">
      <div className="px-5 pt-5 pb-3 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 bg-brand-mid border border-brand-accent rounded-xl flex items-center justify-center active:scale-95"
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

      <div className="px-5 flex flex-col gap-4">
        <div className="card">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${typeCls}`}>
              {inspection.inspection_type}
            </span>
            <span className={`text-xs font-semibold ${statusCls}`}>● {inspection.status}</span>
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
            <p className="text-gray-400 text-sm mt-1">
              Inspector: <span className="text-gray-300">{inspection.inspector_name}</span>
            </p>
          )}
          {inspection.notes && (
            <p className="text-gray-400 text-sm mt-2 border-t border-brand-accent pt-2">
              {inspection.notes}
            </p>
          )}
        </div>

        {damages.length > 0 && (
          <div>
            <h3 className="text-sm font-bold text-gray-300 mb-2 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-500" />
              Damage Notes ({damages.length})
            </h3>
            <div className="flex flex-col gap-2">
              {damages.map((d) => (
                <div key={d.id} className="card text-sm">
                  <p className="font-semibold text-brand-white">{d.location}</p>
                  {d.description && <p className="text-gray-400 mt-0.5">{d.description}</p>}
                  {d.repair_order && <p className="text-gray-500 text-xs mt-1">RO: {d.repair_order}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <h3 className="text-sm font-bold text-gray-300 mb-3 flex items-center gap-2">
            <Camera className="w-4 h-4 text-brand-blue" />
            Inspection Media
          </h3>
          <MediaGallery media={media} />
        </div>
      </div>
    </div>
  )
}
