/**
 * DealerSuite — Manager Inspections Tab
 * Filterable list of all inspections with Drive folder links.
 */
import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, ClipboardList } from 'lucide-react'
import api from '../../utils/api'
import InspectionCard from '../../components/dashboard/InspectionCard'

const TYPE_FILTERS   = ['All', 'Checkout', 'Checkin', 'Inventory', 'Sales']
const STATUS_FILTERS = ['All', 'Completed', 'In Progress', 'Failed']
const DAY_FILTERS    = [
  { label: 'Today',     days: 1  },
  { label: '7 days',    days: 7  },
  { label: '30 days',   days: 30 },
  { label: 'All time',  days: null },
]

export default function InspectionsPage() {
  const [inspections, setInspections] = useState([])
  const [total,       setTotal]       = useState(0)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [typeFilter,  setTypeFilter]  = useState('All')
  const [statusFilter,setStatusFilter]= useState('All')
  const [dayFilter,   setDayFilter]   = useState(7)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ limit: 100 })
      if (typeFilter   !== 'All') params.set('inspection_type', typeFilter)
      if (statusFilter !== 'All') params.set('status', statusFilter)
      if (dayFilter)              params.set('days', dayFilter)

      const { data } = await api.get(`/api/manager/inspections?${params}`)
      setInspections(data.inspections)
      setTotal(data.total)
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not load inspections')
    } finally {
      setLoading(false)
    }
  }, [typeFilter, statusFilter, dayFilter])

  useEffect(() => { load() }, [load])

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-extrabold text-brand-white">Inspections</h2>
            <p className="text-gray-500 text-sm">
              {loading ? 'Loading…' : `${total} record${total !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button
            onClick={load}
            className="w-11 h-11 bg-brand-mid border border-brand-accent rounded-xl
                       flex items-center justify-center active:scale-95"
          >
            <RefreshCw className={`w-5 h-5 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Day filter */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 mb-2">
          {DAY_FILTERS.map(({ label, days }) => (
            <button
              key={label}
              onClick={() => setDayFilter(days)}
              className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-full border transition-colors
                ${dayFilter === days
                  ? 'bg-brand-blue border-brand-blue text-white'
                  : 'bg-brand-mid border-brand-accent text-gray-400'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Type filter */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 mb-2">
          {TYPE_FILTERS.map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-full border transition-colors
                ${typeFilter === t
                  ? 'bg-purple-700 border-purple-600 text-white'
                  : 'bg-brand-mid border-brand-accent text-gray-400'}`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Status filter */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-full border transition-colors
                ${statusFilter === s
                  ? 'bg-green-800 border-green-700 text-white'
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

        {!loading && !error && inspections.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <ClipboardList className="w-12 h-12 text-brand-accent" strokeWidth={1} />
            <p className="text-gray-400 font-semibold">No inspections found</p>
            <p className="text-gray-600 text-sm">Try adjusting the filters above</p>
          </div>
        )}

        {!loading && inspections.map((i) => (
          <InspectionCard key={i.id} inspection={i} />
        ))}
      </div>
    </div>
  )
}
