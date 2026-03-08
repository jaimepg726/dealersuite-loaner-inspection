/**
 * DealerSuite — DamageLogger
 *
 * After the video walkround, the porter documents any damage found.
 * Each damage item has:
 *   • Panel location (picked from a grid)
 *   • Optional photo  (native camera via <input capture>)
 *   • Optional description (text)
 *
 * Photos captured during the video are passed in via `capturedPhotos` and
 * pre-populate the list so the porter just needs to assign locations.
 *
 * Props:
 *   capturedPhotos: Blob[]    — stills taken during recording
 *   onComplete(damages)       — called with array of damage objects
 *   onSkip()                  — called when porter taps "No Damage Found"
 */

import { useState, useRef } from 'react'
import {
  Plus,
  Trash2,
  CheckCircle,
  Camera,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'

const LOCATIONS = [
  'Front',
  'Rear',
  'Driver Front',
  'Driver Rear',
  'Passenger Front',
  'Passenger Rear',
  'Roof',
  'Hood',
  'Trunk',
  'Interior',
  'Windshield',
  'Other',
]

const LOCATION_COLORS = {
  'Front':           'bg-brand-blue/20 border-brand-blue/40 text-brand-blue',
  'Rear':            'bg-purple-900/30 border-purple-700 text-purple-400',
  'Driver Front':    'bg-red-900/30 border-red-700 text-red-400',
  'Driver Rear':     'bg-red-900/20 border-red-800 text-red-500',
  'Passenger Front': 'bg-orange-900/30 border-orange-700 text-orange-400',
  'Passenger Rear':  'bg-orange-900/20 border-orange-800 text-orange-500',
  'Roof':            'bg-yellow-900/30 border-yellow-700 text-yellow-400',
  'Hood':            'bg-green-900/30 border-green-700 text-green-400',
  'Trunk':           'bg-teal-900/30 border-teal-700 text-teal-400',
  'Interior':        'bg-gray-800 border-gray-600 text-gray-300',
  'Windshield':      'bg-sky-900/30 border-sky-700 text-sky-400',
  'Other':           'bg-brand-accent border-brand-accent text-gray-400',
}

// ── Damage Item Card ──────────────────────────────────────────────────────────

function DamageItem({ item, index, onUpdate, onRemove }) {
  const [expanded, setExpanded] = useState(true)
  const fileInputRef = useRef(null)

  function handlePhotoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const blob       = file.slice(0, file.size, file.type)
    const previewUrl = URL.createObjectURL(blob)
    onUpdate(index, { photoBlob: blob, previewUrl })
  }

  const locCls = LOCATION_COLORS[item.location] || LOCATION_COLORS['Other']

  return (
    <div className="card border border-brand-accent">
      {/* Header row */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-yellow-900/40 flex items-center justify-center shrink-0">
          <AlertTriangle className="w-4 h-4 text-yellow-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-brand-white font-bold text-sm">
            Damage #{index + 1}
          </p>
          {item.location && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${locCls}`}>
              {item.location}
            </span>
          )}
        </div>
        <button
          onClick={() => setExpanded(v => !v)}
          className="text-gray-500 shrink-0"
        >
          {expanded
            ? <ChevronUp className="w-5 h-5" />
            : <ChevronDown className="w-5 h-5" />}
        </button>
        <button
          onClick={() => onRemove(index)}
          className="text-gray-600 shrink-0"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {expanded && (
        <div className="mt-4 flex flex-col gap-4">
          {/* Location picker */}
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
              Location *
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {LOCATIONS.map(loc => {
                const cls = item.location === loc
                  ? (LOCATION_COLORS[loc] || LOCATION_COLORS['Other'])
                  : 'bg-brand-mid border-brand-accent text-gray-500'
                return (
                  <button
                    key={loc}
                    onClick={() => onUpdate(index, { location: loc })}
                    className={`text-xs font-bold px-2 py-2 rounded-xl border transition-colors ${cls}`}
                  >
                    {loc}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Photo */}
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
              Photo
            </p>
            {item.previewUrl ? (
              <div className="relative">
                <img
                  src={item.previewUrl}
                  alt="Damage"
                  className="w-full h-36 object-cover rounded-xl border border-brand-accent"
                />
                <button
                  onClick={() => onUpdate(index, { photoBlob: null, previewUrl: null })}
                  className="absolute top-2 right-2 w-7 h-7 bg-black/60 rounded-full
                             flex items-center justify-center text-white"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-24 border-2 border-dashed border-brand-accent rounded-xl
                           flex flex-col items-center justify-center gap-2
                           text-gray-500 active:scale-95 transition-transform"
              >
                <Camera className="w-6 h-6" />
                <span className="text-xs font-semibold">Tap to take photo</span>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handlePhotoChange}
            />
          </div>

          {/* Description */}
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
              Description (optional)
            </p>
            <textarea
              value={item.description}
              onChange={e => onUpdate(index, { description: e.target.value })}
              placeholder="Describe the damage…"
              rows={2}
              className="w-full bg-brand-dark border border-brand-accent rounded-xl
                         px-4 py-3 text-brand-white placeholder-gray-600 resize-none
                         focus:outline-none focus:border-brand-blue transition-colors text-sm"
            />
          </div>
        </div>
      )}
    </div>
  )
}


// ── Main component ────────────────────────────────────────────────────────────

export default function DamageLogger({ capturedPhotos = [], onComplete, onSkip }) {
  // Initialise with any photos captured during the video walkround
  const [items, setItems] = useState(() =>
    capturedPhotos.map(blob => ({
      location:    '',
      description: '',
      photoBlob:   blob,
      previewUrl:  URL.createObjectURL(blob),
    }))
  )

  function addItem() {
    setItems(prev => [
      ...prev,
      { location: '', description: '', photoBlob: null, previewUrl: null },
    ])
  }

  function updateItem(index, patch) {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, ...patch } : item))
  }

  function removeItem(index) {
    setItems(prev => prev.filter((_, i) => i !== index))
  }

  function handleSubmit() {
    // Filter out items that have no location set (incomplete)
    const valid = items.filter(d => d.location)
    onComplete(valid)
  }

  const hasItems = items.length > 0

  return (
    <div className="flex flex-col gap-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-extrabold text-brand-white">Log Damage</h3>
          <p className="text-gray-500 text-sm">
            {hasItems
              ? `${items.length} item${items.length !== 1 ? 's' : ''} — tap to edit`
              : 'No damage items yet'}
          </p>
        </div>
        <span className="text-xs font-bold bg-brand-yellow/20 border border-yellow-700
                         text-yellow-400 px-3 py-1 rounded-full">
          {items.length}
        </span>
      </div>

      {/* Damage items */}
      <div className="flex flex-col gap-3">
        {items.map((item, i) => (
          <DamageItem
            key={i}
            item={item}
            index={i}
            onUpdate={updateItem}
            onRemove={removeItem}
          />
        ))}
      </div>

      {/* Add damage button */}
      <button
        onClick={addItem}
        className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl
                   border-2 border-dashed border-brand-accent text-gray-400
                   font-bold active:scale-95 transition-transform"
      >
        <Plus className="w-5 h-5" />
        Add Damage Item
      </button>

      {/* Action buttons */}
      <div className="flex flex-col gap-3 pt-2">
        {hasItems && (
          <button onClick={handleSubmit} className="btn-danger">
            <AlertTriangle className="w-5 h-5" />
            Submit {items.length} Damage Report{items.length !== 1 ? 's' : ''}
          </button>
        )}

        <button onClick={onSkip} className="btn-success">
          <CheckCircle className="w-5 h-5" />
          {hasItems ? 'Skip Damage & Complete' : 'No Damage Found — Complete'}
        </button>
      </div>

      <p className="text-gray-600 text-xs text-center">
        Tap "No Damage Found" if the vehicle is clean.
      </p>
    </div>
  )
}
