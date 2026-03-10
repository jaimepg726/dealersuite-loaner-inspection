import { useState, useEffect } from 'react'
import { X, LogOut } from 'lucide-react'
import api from '../../utils/api'

const FUEL = ['F','3/4','1/2','1/4','E']

export default function CheckoutModal({ onClose, onDone }) {
  const [vehicles, setVehicles] = useState([])
  const [form, setForm] = useState({ vehicle_id:'', customer_name:'', customer_phone:'', ro_number:'', advisor_name:'', mileage_out:'', fuel_out:'', notes:'' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.get('/api/fleet/vehicles?limit=200').then(r => setVehicles(r.data.vehicles || [])).catch(()=>{})
  }, [])

  const set = (k, v) => setForm(f => ({...f, [k]: v}))

  const submit = async () => {
    if (!form.vehicle_id || !form.customer_name.trim()) { setError('Vehicle and customer name required'); return }
    setSaving(true); setError(null)
    try {
      await api.post('/api/loaners/', {
        vehicle_id: parseInt(form.vehicle_id),
        customer_name: form.customer_name.trim(),
        customer_phone: form.customer_phone || null,
        ro_number: form.ro_number || null,
        advisor_name: form.advisor_name || null,
        mileage_out: form.mileage_out ? parseInt(form.mileage_out) : null,
        fuel_out: form.fuel_out || null,
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
      <div className="w-full max-w-lg bg-brand-dark border border-brand-accent rounded-t-2xl p-5 max-h-[90vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-xl font-extrabold text-brand-white flex items-center gap-2"><LogOut className="w-5 h-5 text-brand-blue"/>Checkout Loaner</h3>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-lg bg-brand-mid border border-brand-accent"><X className="w-4 h-4 text-gray-400"/></button>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label className={lbl}>Vehicle *</label>
            <select value={form.vehicle_id} onChange={e=>set('vehicle_id',e.target.value)} className={inp}>
              <option value="">Select vehicle…</option>
              {vehicles.map(v=><option key={v.id} value={v.id}>{v.loaner_number ? `${v.loaner_number} — ` : ''}{v.year} {v.make} {v.model} ({v.plate||'no plate'})</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>Customer Name *</label>
            <input className={inp} placeholder="Full name" value={form.customer_name} onChange={e=>set('customer_name',e.target.value)}/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Phone</label>
              <input className={inp} placeholder="(555) 000-0000" value={form.customer_phone} onChange={e=>set('customer_phone',e.target.value)}/>
            </div>
            <div>
              <label className={lbl}>RO Number</label>
              <input className={inp} placeholder="12345" value={form.ro_number} onChange={e=>set('ro_number',e.target.value)}/>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Advisor</label>
              <input className={inp} placeholder="Advisor name" value={form.advisor_name} onChange={e=>set('advisor_name',e.target.value)}/>
            </div>
            <div>
              <label className={lbl}>Mileage Out</label>
              <input className={inp} type="number" placeholder="12500" value={form.mileage_out} onChange={e=>set('mileage_out',e.target.value)}/>
            </div>
          </div>
          <div>
            <label className={lbl}>Fuel Level Out</label>
            <div className="flex gap-2">
              {FUEL.map(f=>(
                <button key={f} onClick={()=>set('fuel_out',f)}
                  className={`flex-1 py-2 rounded-lg border text-xs font-bold transition-colors ${form.fuel_out===f ? 'bg-brand-blue border-brand-blue text-white' : 'bg-brand-mid border-brand-accent text-gray-400'}`}>
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={lbl}>Notes</label>
            <textarea className={`${inp} resize-none`} rows={2} placeholder="Any notes…" value={form.notes} onChange={e=>set('notes',e.target.value)}/>
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button onClick={submit} disabled={saving}
            className="w-full bg-brand-blue text-white font-bold py-3 rounded-xl active:scale-95 disabled:opacity-50">
            {saving ? 'Saving…' : 'Checkout Vehicle'}
          </button>
        </div>
      </div>
    </div>
  )
}
