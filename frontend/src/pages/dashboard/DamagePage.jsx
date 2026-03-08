/**
 * DealerSuite — Manager Damage Review Tab
 * Filterable queue of all damage items.
 * Manager assigns RO numbers and advances status via DamageCard.
 */
import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, AlertTriangle } from 'lucide-react'
import api from '../../utils/api'
import DamageCard from '../../components/dashboard/DamageCard'

const STATUS_FILTERS = [
  'All',
  'Open',
  'RO Assigned',
  'In Repair',
  'Repaired',
  'Waived',
]

export default function DamagePage() {
  const [damages,      setDamages]      = useState([])
  const [total,        setTotal]        = useState(0)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState(null)
  const [statusFilter, setStatusFilter] = useState('All')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ limit: 100 })
      if (statusFilter !== 'All') params.set('status', statusFilter)

      const { data } = await api.get(`/api/manager/damage?${params}`)
      setDamages(data.damages)
      setTotal(data.total)
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not load damage queue')
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => { load() }, [load])

  // Count open items for badge
  const openCount = damages.filter((d) => d.status === 'Open').length

  return (
    <div className="flex flex-col">

      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-extrabold text-brand-white">Damage</h2>
              {openCount > 0 && (
                <span className="text-xs font-bold bg-red-600 text-white px-2 py-0.5 rounded-full">
                  {openCount} open
                </span>
              )}
            </div>
            <p className="text-gray-500 text-sm">
              {loading ? 'Loading…' : `${total} item${total !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button
            onClick={load}
            className="w-11 h-11 bg-brand-mid border border-brand-accent rounded-xl
                       flex items-center justify-center active:scale-95 transition-transform"
            aria-label="Refresh"
          >
            <RefreshCw className={`w-5 h-5 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Status filter chips */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-full border transition-colors
                ${statusFilter === s
                  ? 'bg-brand-yellow border-yellow-600 text-black'
                  : 'bg-brand-mid border-brand-accent text-gray-400'}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="px-5 pb-6 flex flex-col gap-3">
        {loading && [...Array(4)].map((_, i) => (
          <div key={i} className="card h-20 animate-pulse bg-brand-mid" />
        ))}

        {!loading && error && (
          <p className="text-red-400 text-sm text-center py-8">{error}</p>
        )}

        {!loading && !error && damages.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <AlertTriangle className="w-12 h-12 text-brand-accent" strokeWidth={1} />
            <p className="text-gray-400 font-semibold">No damage items found</p>
            <p className="text-gray-600 text-sm">
              {statusFilter === 'All'
                ? 'No damage has been logged yet'
                : `No items with status "${statusFilter}"`}
            </p>
          </div>
        )}

        {!loading && damages.map((d) => (
          <DamageCard key={d.id} damage={d} onUpdated={load} />
        ))}
      </div>
    </div>
  )
}
