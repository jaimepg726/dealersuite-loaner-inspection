/**
 * DealerSuite — Inspection Card
 * Single row in the inspections list.
 * Tapping opens the Drive folder link if available.
 */
import { ExternalLink, Camera, AlertTriangle } from 'lucide-react'

const TYPE_COLOR = {
  Checkout:  'bg-brand-blue/20 text-brand-blue',
  Checkin:   'bg-green-900/50  text-green-400',
  Inventory: 'bg-purple-900/50 text-purple-400',
  Sales:     'bg-orange-900/50 text-orange-400',
}

const STATUS_COLOR = {
  Completed:   'text-green-400',
  'In Progress':'text-yellow-400',
  Failed:      'text-red-400',
}

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function InspectionCard({ inspection }) {
  const { vehicle } = inspection
  const typeCls   = TYPE_COLOR[inspection.inspection_type]   || TYPE_COLOR.Checkout
  const statusCls = STATUS_COLOR[inspection.status]          || 'text-gray-400'

  return (
    <div className="card hover:border-brand-blue/40 transition-colors">
      <div className="flex items-start justify-between gap-3">
        {/* Left: vehicle + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${typeCls}`}>
              {inspection.inspection_type}
            </span>
            <span className={`text-xs font-semibold ${statusCls}`}>
              ● {inspection.status}
            </span>
          </div>

          {vehicle ? (
            <p className="text-brand-white font-bold leading-tight">
              {vehicle.year} {vehicle.make} {vehicle.model}
              {vehicle.loaner_number && (
                <span className="text-gray-500 font-normal ml-2">#{vehicle.loaner_number}</span>
              )}
            </p>
          ) : (
            <p className="text-gray-500 text-sm">Vehicle #{inspection.vehicle_id}</p>
          )}

          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="text-gray-500 text-xs">{formatDate(inspection.started_at)}</span>
            {inspection.inspector_name && (
              <span className="text-gray-500 text-xs">· {inspection.inspector_name}</span>
            )}
          </div>

          <div className="flex items-center gap-3 mt-1">
            {inspection.photo_count > 0 && (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <Camera className="w-3 h-3" /> {inspection.photo_count}
              </span>
            )}
            {inspection.damages?.length > 0 && (
              <span className="flex items-center gap-1 text-xs text-yellow-500">
                <AlertTriangle className="w-3 h-3" /> {inspection.damages.length} damage
              </span>
            )}
          </div>
        </div>

        {/* Right: Drive link */}
        {inspection.drive_folder_url && (
          <a
            href={inspection.drive_folder_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 w-11 h-11 bg-brand-accent rounded-xl
                       flex items-center justify-center
                       hover:bg-brand-blue/20 transition-colors"
            aria-label="Open in Google Drive"
          >
            <ExternalLink className="w-5 h-5 text-gray-400" />
          </a>
        )}
      </div>
    </div>
  )
}
