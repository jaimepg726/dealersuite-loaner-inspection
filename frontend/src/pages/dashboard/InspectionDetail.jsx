/**
 * DealerSuite — Inspection Detail Page
 * Linked from the manager inspections list.
 * Shows vehicle info, inspection metadata, damages, and a full media gallery.
 */
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Camera, AlertTriangle, X, Play } from 'lucide-react'
import api from '../../utils/api'

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

function MediaGallery({ media }) {
  const [lightbox, setLightbox] = useState(null)  // url of full-screen photo

  const photos = media.filter(m => m.type === 'photo')
  const videos = media.filter(m => m.type === 'video')

  if (media.length === 0) {
    return (
      <p className="text-gray-500 text-sm text-center py-4">No media uploaded</p>
    )
  }

  return (
    <div className="space-y-4">
      {/* Photos */}
      {photos.length > 0 && (
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
            Photos ({photos.length})
          </p>
          <div className="grid grid-cols-3 gap-2">
            {photos.map((m, i) => (
              <button
                key={i}
                onClick={() => setLightbox(m.url)}
                className="aspect-square rounded-lg overflow-hidden bg-brand-mid border border-brand-accent
                           hover:border-brand-blue/50 transition-colors relative"
              >
                <img
                  src={m.url}
                  alt={`Photo ${i + 1}`}
                  className="w-full h-full object-cover"
                  onError={e => {
                    e.target.style.display = 'none'
                    e.target.parentElement.classList.add('flex', 'items-center', 'justify-center')
                  }}
                />
                <div className="absolute inset-0 flex items-center justify-center opacity-0
                                hover:opacity-100 bg-black/40 transition-opacity">
                  <Camera className="w-6 h-6 text-white" />
                </div>
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
          <div className="space-y-3">
            {videos.map((m, i) => (
              <div key={i} className="rounded-xl overflow-hidden bg-brand-mid border border-brand-accent">
                <video
                  controls
                  src={m.url}
                  style={{ width: '100%', maxWidth: '480px' }}
                  className="block"
                >
                  <a href={m.url} target="_blank" rel="noopener noreferrer"
                     className="text-brand-blue text-sm">
                    Open video ↗
                  </a>
                </video>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 text-white hover:text-gray-300"
          >
            <X className="w-8 h-8" />
          </button>
          <img
            src={lightbox}
            alt="Full size"
            className="max-w-full max-h-full rounded-lg object-contain"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}

export { MediaGallery }

export default function InspectionDetail() {
  const { inspectionId } = useParams()
  const navigate = useNavigate()
  const [inspection, setInspection] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.get(`/api/manager/inspections/${inspectionId}`)
      .then(({ data }) => setInspection(data))
      .catch(err => setError(err.response?.data?.detail || 'Could not load inspection'))
      .finally(() => setLoading(false))
  }, [inspectionId])

  if (loading) return (
    <div className="p-5">
      <div className="card h-32 animate-pulse bg-brand-mid" />
    </div>
  )
  if (error) return (
    <div className="p-5 text-red-400 text-center">{error}</div>
  )
  if (!inspection) return null

  const { vehicle } = inspection
  const typeCls   = TYPE_COLOR[inspection.inspection_type]  || TYPE_COLOR.Checkout
  const statusCls = STATUS_COLOR[inspection.status]         || 'text-gray-400'

  return (
    <div className="flex flex-col pb-8">
      {/* Header */}
      <div className="px-5 pt-5 pb-3 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-xl bg-brand-mid border border-brand-accent
                     flex items-center justify-center active:scale-95"
        >
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </button>
        <div>
          <h2 className="text-xl font-extrabold text-brand-white">Inspection Detail</h2>
          <p className="text-gray-500 text-xs">#{inspection.id}</p>
        </div>
      </div>

      <div className="px-5 flex flex-col gap-4">

        {/* Vehicle Card */}
        <div className="card">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Vehicle</p>
          {vehicle ? (
            <>
              <p className="text-brand-white font-bold text-lg leading-tight">
                {vehicle.year} {vehicle.make} {vehicle.model}
              </p>
              {vehicle.loaner_number && (
                <p className="text-gray-400 text-sm">Loaner #{vehicle.loaner_number}</p>
              )}
              {vehicle.plate && (
                <p className="text-gray-500 text-xs mt-1">{vehicle.plate} · {vehicle.color}</p>
              )}
            </>
          ) : (
            <p className="text-gray-500 text-sm">Vehicle #{inspection.vehicle_id}</p>
          )}
        </div>

        {/* Inspection Info */}
        <div className="card">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Inspection</p>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${typeCls}`}>
              {inspection.inspection_type}
            </span>
            <span className={`text-xs font-semibold ${statusCls}`}>
              ● {inspection.status}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-y-2 text-sm">
            <span className="text-gray-500">Inspector</span>
            <span className="text-brand-white">{inspection.inspector_name || '—'}</span>
            <span className="text-gray-500">Started</span>
            <span className="text-brand-white">{formatDate(inspection.started_at)}</span>
            {inspection.completed_at && (
              <>
                <span className="text-gray-500">Completed</span>
                <span className="text-brand-white">{formatDate(inspection.completed_at)}</span>
              </>
            )}
            <span className="text-gray-500">Photos</span>
            <span className="text-brand-white">{inspection.photo_count}</span>
          </div>
          {inspection.notes && (
            <div className="mt-3 pt-3 border-t border-brand-accent">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Notes</p>
              <p className="text-gray-300 text-sm">{inspection.notes}</p>
            </div>
          )}
        </div>

        {/* Damage Items */}
        {inspection.damages?.length > 0 && (
          <div className="card">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
              Damage ({inspection.damages.length})
            </p>
            <div className="flex flex-col gap-3">
              {inspection.damages.map(d => (
                <div key={d.id} className="border-t border-brand-accent pt-3 first:border-0 first:pt-0">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0" />
                    <span className="text-brand-white font-semibold text-sm">{d.location || 'Unknown location'}</span>
                    <span className="ml-auto text-xs text-gray-500">{d.status}</span>
                  </div>
                  {d.description && (
                    <p className="text-gray-400 text-sm ml-6">{d.description}</p>
                  )}
                  {d.repair_order && (
                    <p className="text-brand-blue text-xs ml-6 mt-0.5">RO: {d.repair_order}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Media Gallery */}
        <div className="card">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
            Media
          </p>
          <MediaGallery media={inspection.media || []} />
        </div>

      </div>
    </div>
  )
}
