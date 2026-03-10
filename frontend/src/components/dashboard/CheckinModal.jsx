import { useState } from 'react'
import { X, LogIn } from 'lucide-react'
import api from '../../utils/api'

const FUEL = ['F','3/4','1/2','1/4','E']

export default function CheckinModal({ loaner, onClose, onDone }) {
  const [form, setForm] = useState({ mileage_in:'', fuel_in:'', notes:'' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  const submit = async () => {
    setSaving(true); setError(null)
    try {
      await api.patch(`/api/loaners/${loaner.id}/checkin`, {
        mileage_in: form.mileage_in ? parseInt(form.mileage_in) : null,
        fuel_in: form.fuel_in || null,
        notes: form.notes || null,
      })
      onDone()
    } catch(e) { setError(e.response?.data?.detail || 'Save failed') }
    finally { setSaving(false) }
  }

  const inp = "w-full bg-brand-mid border border-brand-accent rounded-xl px-4 py-3 text-brand-white placeholder-gray-600 focus:outline-none focus:border-brand-blue"
  const lbl = "text-xs font-bold text-gray-400 mb-1 block"

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div className="w-full max-w-lg bg-brand-dark border border-brand-accent rounded-t-2xl p-5" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-xl font-extrabold text-brand-white flex items-center gap-2"><LogIn className="w-5 h-5 text-green-400"/>Check In Loaner</h3>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-lg bg-brand-mid border border-brand-accent"><X className="w-4 h-4 text-gray-400"/></button>
        </div>

        <div className="bg-brand-mid border border-brand-accent rounded-xl px-4 py-3 mb-4">
          <p className="text-brand-white font-bold">{loaner.vehicle_display || `Vehicle #${loaner.vehicle_id}`}</p>
          <p className="text-gray-400 text-sm">{loaner.customer_name}{loaner.ro_number ? ` · RO# ${loaner.ro_number}` : ''}</p>
        </div>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Mileage In</label>
              <input className={inp} type="number" placeholder="12800" value={form.mileage_in} onChange={e=>set('mileage_in',e.target.value)}/>
            </div>
            <div>
              <label className={lbl}>Fuel Level In</label>
              <div className="flex gap-1">
                {FUEL.map(f=>(
                  <button key={f} onClick={()=>set('fuel_in',f)}
                    className={`flex-1 py-2 rounded-lg border text-xs font-bold transition-colors ${form.fuel_in===f ? 'bg-green-800 border-green-600 text-green-300' : 'bg-brand-mid border-brand-accent text-gray-400'}`}>
                    {f}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <label className={lbl}>Notes</label>
            <textarea className={`${inp} resize-none`} rows={2} placeholder="Any notes on return…" value={form.notes} onChange={e=>set('notes',e.target.value)}/>
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button onClick={submit} disabled={saving}
            className="w-full bg-green-700 text-white font-bold py-3 rounded-xl active:scale-95 disabled:opacity-50">
            {saving ? 'Saving…' : 'Confirm Check In'}
          </button>
        </div>
      </div>
    </div>
  )
}
