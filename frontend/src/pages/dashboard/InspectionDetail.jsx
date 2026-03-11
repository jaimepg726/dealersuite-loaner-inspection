/**
 * DealerSuite — Inspection Detail Page
 * Displays vehicle info, loaner number, inspector, damage notes, and media gallery.
 * Accessed from InspectionsPage when a card is tapped.
 */
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Camera, Video, AlertTriangle, X } from 'lucide-react'
import api from '../../utils/api'

/**
 * Convert a raw Google Drive URL to a viewable thumbnail/embed URL.
 * Input:  https://drive.google.com/file/d/FILE_ID/view  or any drive.google.com URL
 * Output: https://drive.google.com/uc?export=view&id=FILE_ID
 */
function toDriveViewUrl(url) {
  if (!url) return url
  // Already a direct uc link
  if (url.includes('uc?export=view')) return url
  // Extract file ID from /file/d/FILE_ID/ pattern
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/)
  if (match) return `https://drive.google.com/uc?export=view&id=${match[1]}`
  return url
}

/**
 * Side-by-side comparison: previous walkaround frame vs damage photo.
 * Shown when a photo has a matching_frame_url set by the AI matching service.
 */
function FrameComparison({ frameUrl, photoUrl }) {
  return (
    <div className="rounded-xl border border-yellow-700/60 bg-yellow-950/20 overflow-hidden">
      <p className="text-xs font-bold text-yellow-500 uppercase tracking-wider px-3 py-2 border-b border-yellow-700/40">
        Previous Inspection Reference Frame
      </p>
      <div className="grid grid-cols-2 gap-0">
        {/* Left — walkaround frame */}
        <div className="flex flex-col">
          <p className="text-xs font-semibold text-gray-400 px-2 py-1 bg-brand-mid text-center">
            Previous Inspection Frame
          </p>
          <img
            src={frameUrl}
            alt="Previous inspection frame"
            className="w-full aspect-square object-cover"
            loading="lazy"
          />
        </div>
        {/* Right — damage photo */}
        <div className="flex flex-col border-l border-yellow-700/30">
          <p className="text-xs font-semibold text-gray-400 px-2 py-1 bg-brand-mid text-center">
            Damage Photo
          </p>
          <img
            src={toDriveViewUrl(photoUrl)}
            alt="Damage photo"
            className="w-full aspect-square object-cover"
            loading="lazy"
          />
        </div>
      </div>
    </div>
  )
}

function MediaGallery({ media }) {
  const [modalSrc, setModalSrc] = useState(null)
  const [modalType, setModalType] = useState(null)

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
      {/* Frame comparison panels (Checkin damage photos with AI-matched frame) */}
      {photos.some((m) => m.matching_frame_url) && (
        <div className="mb-4 flex flex-col gap-3">
          {photos
            .filter((m) => m.matching_frame_url)
            .map((m) => (
              <FrameComparison
                key={`cmp-${m.id}`}
                frameUrl={m.matching_frame_url}
                photoUrl={m.file_url}
              />
            ))}
        </div>
      )}

      {/* Photos */}
      {photos.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
            Photos ({photos.length})
          </p>
          <div className="grid grid-cols-3 gap-2">
            {photos.map((m) => (
              <button
                key={m.id}
                onClick={() => { setModalSrc(toDriveViewUrl(m.file_url)); setModalType('photo') }}
                className="aspect-square rounded-lg overflow-hidden bg-brand-mid border border-brand-accent
                           hover:border-brand-blue/60 transition-colors"
              >
                <img
                  src={toDriveViewUrl(m.file_url)}
                  alt="Inspection photo"
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Videos */}
      {videos.length > 0 && (
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
            Videos ({videos.length})
          </p>
          <div className="flex flex-col gap-3">
            {videos.map((m) => (
              <div
                key={m.id}
                className="rounded-xl overflow-hidden bg-brand-mid border border-brand-accent"
              >
                <video
                  src={toDriveViewUrl(m.file_url)}
                  controls
                  className="w-full max-h-56 object-contain"
                  preload="metadata"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Photo modal */}
      {modalSrc && modalType === 'photo' && (
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
  Checkin:   'bg-green-900/50  text-green-400',
  Inventory: 'bg-purple-900/50 text-purple-400',
  Sales:     'bg-orange-900/50 text-orange-400',
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
  const typeCls   = TYPE_COLOR[inspection.inspection_type]  || TYPE_COLOR.Checkout
  const statusCls = STATUS_COLOR[inspection.status]         || 'text-gray-400'

  return (
    <div className="flex flex-col pb-8">
      {/* Header */}
      <div className="px-5 pt-5 pb-3 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 bg-brand-mid border border-brand-accent rounded-xl
                     flex items-center justify-center active:scale-95"
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
        {/* Vehicle + inspection meta */}
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

        {/* Damage items */}
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
                  {d.description && (
                    <p className="text-gray-400 mt-0.5">{d.description}</p>
                  )}
                  {d.repair_order && (
                    <p className="text-gray-500 text-xs mt-1">RO: {d.repair_order}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Inspection Media */}
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
