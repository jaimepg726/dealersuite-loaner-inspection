/**
 * DealerSuite — Inspection Card
 * Single row in the inspections list.
 * Tapping navigates to InspectionDetail; Drive link opens externally.
 */
import { useNavigate } from 'react-router-dom'
import { ExternalLink, Camera, Video, AlertTriangle } from 'lucide-react'

const TYPE_COLOR = {
  Checkout:  'bg-brand-blue/20 text-brand-blue',
  Checkin:   'bg-green-900/50  text-green-400',
  Inventory: 'bg-purple-900/50 text-purple-400',
  Sales:     'bg-orange-900/50 text-orange-400',
  Condition: 'bg-teal-900/50   text-teal-400',
}

// Left accent stripe colour per inspection type
const TYPE_ACCENT = {
  Checkout:  'bg-brand-blue',
  Checkin:   'bg-green-500',
  Inventory: 'bg-purple-500',
  Sales:     'bg-orange-500',
  Condition: 'bg-teal-500',
}

const STATUS_COLOR = {
  Completed:    'text-green-400',
  'In Progress':'text-yellow-400',
  Failed:       'text-red-400',
}

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function InspectionCard({ inspection }) {
  const navigate   = useNavigate()
  const { vehicle } = inspection
  const typeCls    = TYPE_COLOR[inspection.inspection_type]  || TYPE_COLOR.Checkout
  const typeAccent = TYPE_ACCENT[inspection.inspection_type] || TYPE_ACCENT.Checkout
  const statusCls  = STATUS_COLOR[inspection.status]         || 'text-gray-400'

  const hasMedia = inspection.video_count > 0 || inspection.photo_count > 0 || inspection.damages?.length > 0

  return (
    <div
      className="bg-brand-mid rounded-2xl border border-brand-accent relative overflow-hidden
                 hover:border-brand-blue/40 transition-colors cursor-pointer active:scale-[0.99]"
      onClick={() => navigate(`/dashboard/inspections/${inspection.id}`)}
    >
      {/* Left type accent stripe */}
      <div className={`absolute left-0 inset-y-0 w-1 ${typeAccent}`} />

      <div className="p-5 pl-6 flex items-start justify-between gap-3">
        {/* Left: vehicle + meta */}
        <div className="flex-1 min-w-0">

          {/* Type + status */}
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${typeCls}`}>
              {inspection.inspection_type}
            </span>
            <span className={`text-xs font-semibold ${statusCls}`}>
              ● {inspection.status}
            </span>
          </div>

          {/* Vehicle name */}
          {vehicle ? (
            <p className="text-brand-white font-bold leading-tight">
              {vehicle.year} {vehicle.make} {vehicle.model}
              {vehicle.loaner_number && (
                <span className="text-gray-500 font-normal ml-2">#{vehicle.loaner_number}</span>
              )}
            </p>
          ) : inspection.inspection_type === 'Condition' ? (
            <div>
              <p className="text-teal-400 text-sm font-semibold">Customer Vehicle</p>
              {inspection.vin_override && (
                <p className="text-gray-500 text-xs font-mono mt-0.5">{inspection.vin_override}</p>
              )}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">Vehicle #{inspection.vehicle_id}</p>
          )}

          {/* Date + inspector */}
          <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 flex-wrap">
            <span>{formatDate(inspection.started_at)}</span>
            {inspection.inspector_name && (
              <span className="text-gray-600">· {inspection.inspector_name}</span>
            )}
          </div>

          {/* Media + damage pill badges */}
          {hasMedia && (
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {inspection.video_count > 0 && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold
                                 bg-brand-blue/10 text-brand-blue border border-brand-blue/25
                                 px-2 py-0.5 rounded-full">
                  <Video className="w-3 h-3" /> {inspection.video_count}
                </span>
              )}
              {inspection.photo_count > 0 && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold
                                 bg-brand-accent/80 text-gray-400 border border-brand-accent
                                 px-2 py-0.5 rounded-full">
                  <Camera className="w-3 h-3" /> {inspection.photo_count}
                </span>
              )}
              {inspection.damages?.length > 0 && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold
                                 bg-yellow-900/40 text-yellow-400 border border-yellow-800/60
                                 px-2 py-0.5 rounded-full">
                  <AlertTriangle className="w-3 h-3" /> {inspection.damages.length}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Right: Drive link */}
        {inspection.drive_folder_url && (
          <a
            href={inspection.drive_folder_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 w-10 h-10 bg-brand-accent rounded-xl
                       flex items-center justify-center
                       hover:bg-brand-blue/20 transition-colors"
            aria-label="Open in Google Drive"
          >
            <ExternalLink className="w-4 h-4 text-gray-400" />
          </a>
        )}
      </div>
    </div>
  )
}
