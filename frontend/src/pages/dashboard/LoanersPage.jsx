import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Car, LogIn, LogOut, Clock } from 'lucide-react'
import api from '../../utils/api'
import CheckoutModal from '../../components/dashboard/CheckoutModal'
import CheckinModal from '../../components/dashboard/CheckinModal'

const SC = { Out:'bg-blue-900/50 text-blue-300 border-blue-700', Returned:'bg-green-900/50 text-green-400 border-green-700' }

function LoanerCard({ loaner, onCheckin }) {
  const days = Math.floor((Date.now() - new Date(loaner.checked_out_at)) / 86400000)
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-1">
        <span className="text-lg font-extrabold text-brand-white">{loaner.vehicle_display || `Vehicle #${loaner.vehicle_id}`}</span>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${SC[loaner.status]||SC.Out}`}>{loaner.status}</span>
      </div>
      <p className="text-brand-white font-semibold text-sm">{loaner.customer_name}</p>
      <div className="flex flex-wrap gap-3 text-xs text-gray-400 mt-1 mb-3">
        {loaner.ro_number && <span>RO# {loaner.ro_number}</span>}
        {loaner.advisor_name && <span>Advisor: {loaner.advisor_name}</span>}
        {loaner.mileage_out != null && <span>Out: {loaner.mileage_out.toLocaleString()} mi</span>}
        {loaner.fuel_out && <span>Fuel out: {loaner.fuel_out}</span>}
        <span className="flex items-center gap-1"><Clock className="w-3 h-3"/>{days === 0 ? 'Today' : `${days}d out`}</span>
      </div>
      {loaner.status === 'Out' && (
        <button onClick={() => onCheckin(loaner)}
          className="w-full flex items-center justify-center gap-2 bg-green-900/30 border border-green-700/50 text-green-400 text-sm font-bold py-2 rounded-lg active:scale-95">
          <LogIn className="w-4 h-4"/> Check In
        </button>
      )}
    </div>
  )
}

export default function LoanersPage() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('Out')
  const [showCheckout, setShowCheckout] = useState(false)
  const [checkinTarget, setCheckinTarget] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const p = filter !== 'All' ? `?status=${filter}` : ''
      const r = await api.get(`/api/loaners/${p}`)
      setData(r.data)
    } catch(e) { setError(e.response?.data?.detail || 'Load failed') }
    finally { setLoading(false) }
  }, [filter])

  useEffect(() => { load() }, [load])

  const out = data.filter(l => l.status === 'Out').length
  const ret = data.filter(l => l.status === 'Returned').length

  return (
    <div className="flex flex-col">
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-extrabold text-brand-white">Loaners</h2>
            <p className="text-gray-500 text-sm">{loading ? 'Loading…' : `${out} out · ${ret} returned`}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={load} className="w-11 h-11 bg-brand-mid border border-brand-accent rounded-xl flex items-center justify-center active:scale-95">
              <RefreshCw className={`w-5 h-5 text-gray-400 ${loading ? 'animate-spin' : ''}`}/>
            </button>
            <button onClick={() => setShowCheckout(true)}
              className="flex items-center gap-2 bg-brand-blue text-white font-bold text-sm px-4 py-3 rounded-xl active:scale-95">
              <LogOut className="w-4 h-4"/> Checkout
            </button>
          </div>
        </div>

        <div className="flex gap-2 mb-2">
          {['Out','Returned','All'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-colors ${filter===f ? 'bg-brand-blue border-brand-blue text-white' : 'bg-brand-mid border-brand-accent text-gray-400'}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 pb-6 flex flex-col gap-3">
        {loading && [...Array(3)].map((_,i) => <div key={i} className="card h-24 animate-pulse bg-brand-mid"/>)}
        {!loading && error && <p className="text-red-400 text-sm text-center py-8">{error}</p>}
        {!loading && !error && !data.length && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Car className="w-12 h-12 text-brand-accent" strokeWidth={1}/>
            <p className="text-gray-400 font-semibold">{filter === 'Out' ? 'No loaners currently out' : 'No loaner records found'}</p>
            <p className="text-gray-600 text-sm">Tap Checkout to log a new loaner</p>
          </div>
        )}
        {!loading && data.map(l => <LoanerCard key={l.id} loaner={l} onCheckin={setCheckinTarget}/>)}
      </div>

      {showCheckout && <CheckoutModal onClose={() => setShowCheckout(false)} onDone={() => { setShowCheckout(false); load() }}/>}
      {checkinTarget && <CheckinModal loaner={checkinTarget} onClose={() => setCheckinTarget(null)} onDone={() => { setCheckinTarget(null); load() }}/>}
    </div>
  )
}
