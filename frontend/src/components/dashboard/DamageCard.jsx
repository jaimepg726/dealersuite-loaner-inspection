/**
 * DealerSuite — Damage Card
 * Shown in the Damage Review tab.
 * Manager taps to expand and assign a Repair Order number or update status.
 */
import { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, Check, ExternalLink } from 'lucide-react'
import api from '../../utils/api'

const STATUS_OPTIONS = ['Open', 'RO Assigned', 'In Repair', 'Repaired', 'Waived']

const STATUS_STYLE = {
  'Open':        'bg-red-900/60    text-red-400    border-red-700',
  'RO Assigned': 'bg-yellow-900/60 text-yellow-400 border-yellow-700',
  'In Repair':   'bg-brand-blue/20 text-brand-blue border-brand-blue/40',
  'Repaired':    'bg-green-900/60  text-green-400  border-green-700',
  'Waived':      'bg-gray-800      text-gray-500   border-gray-700',
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function DamageCard({ damage, onUpdated }) {
  const [expanded,  setExpanded]  = useState(false)
  const [ro,        setRo]        = useState(damage.repair_order || '')
  const [status,    setStatus]    = useState(damage.status)
  const [notes,     setNotes]     = useState(damage.manager_notes || '')
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(false)

  const vehicle = damage.inspection?.vehicle

  async function handleSave() {
    setSaving(true)
    try {
      await api.patch(`/api/manager/damage/${damage.id}`, {
        repair_order:  ro   || null,
        status,
        manager_notes: notes || null,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      onUpdated?.()
    } catch (err) {
      console.error('Damage update failed', err)
    } finally {
      setSaving(false)
    }
  }

  const statusCls = STATUS_STYLE[status] || STATUS_STYLE.Open

  return (
    <div className={`card border transition-colors ${expanded ? 'border-brand-blue/40' : ''}`}>
      {/* Summary row — always visible */}
      <button
        className="w-full text-left flex items-start gap-3"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="w-10 h-10 bg-yellow-900/40 rounded-xl flex items-center justify-center shrink-0">
          <AlertTriangle className="w-5 h-5 text-yellow-400" />
        </div>

        <div className="flex-1 min-w-0">
          {vehicle && (
            <p className="text-brand-white font-bold text-sm leading-tight">
              {vehicle.year} {vehicle.make} {vehicle.model}
              {vehicle.loaner_number && (
                <span className="text-gray-500 font-normal ml-1">#{vehicle.loaner_number}</span>
              )}
            </p>
          )}
          <p className="text-gray-400 text-xs mt-0.5">
            {damage.location || 'Location not specified'}
            {damage.description && ` · ${damage.description.slice(0, 50)}${damage.description.length > 50 ? '…' : ''}`}
          </p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${statusCls}`}>
              {status}
            </span>
            {damage.repair_order && (
              <span className="text-xs text-gray-500 font-mono">RO# {damage.repair_order}</span>
            )}
            <span className="text-xs text-gray-600">{formatDate(damage.created_at)}</span>
          </div>
        </div>

        {/* Expand icon */}
        <div className="shrink-0 text-gray-500">
          {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </div>
      </button>

      {/* Expanded edit area */}
      {expanded && (
        <div className="mt-4 pt-4 border-t border-brand-accent flex flex-col gap-4">

          {/* Photo link */}
          {damage.photo_url && (
            <a
              href={damage.photo_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-brand-blue text-sm font-semibold"
            >
              <ExternalLink className="w-4 h-4" /> View Damage Photo
            </a>
          )}

          {/* Full description */}
          {damage.description && (
            <p className="text-gray-300 text-sm">{damage.description}</p>
          )}

          {/* RO Number input */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
              Repair Order #
            </label>
            <input
              type="text"
              value={ro}
              onChange={(e) => setRo(e.target.value.toUpperCase())}
              placeholder="e.g. 123456"
              className="bg-brand-dark border border-brand-accent rounded-xl px-4 py-3
                         text-brand-white font-mono placeholder-gray-600
                         focus:outline-none focus:border-brand-blue transition-colors"
            />
          </div>

          {/* Status selector */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
              Status
            </label>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`text-xs font-bold px-3 py-2 rounded-xl border transition-colors
                    ${status === s
                      ? (STATUS_STYLE[s] || 'bg-brand-blue text-white border-brand-blue')
                      : 'bg-brand-mid border-brand-accent text-gray-500'
                    }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Manager notes */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional manager notes…"
              rows={2}
              className="bg-brand-dark border border-brand-accent rounded-xl px-4 py-3
                         text-brand-white placeholder-gray-600 resize-none
                         focus:outline-none focus:border-brand-blue transition-colors text-sm"
            />
          </div>

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-success disabled:opacity-50"
          >
            {saving ? (
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : saved ? (
              <><Check className="w-5 h-5" /> Saved!</>
            ) : (
              <><Check className="w-5 h-5" /> Save Changes</>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
