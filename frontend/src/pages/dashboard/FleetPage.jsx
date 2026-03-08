/**
 * DealerSuite — Manager Fleet Page
 * Shows all fleet vehicles with search/filter.
 * Manager can import a TSD Dealer CSV to add/update vehicles.
 */

import { useState, useEffect, useCallback } from 'react'
import { Upload, Search, Filter, RefreshCw } from 'lucide-react'
import api from '../../utils/api'
import FleetTable    from '../../components/dashboard/FleetTable'
import CSVImportModal from '../../components/dashboard/CSVImportModal'

const STATUS_FILTERS  = ['All', 'Active', 'In Service', 'Retired']
const TYPE_FILTERS    = ['All', 'Loaner', 'Inventory', 'Sales']

export default function FleetPage() {
  const [vehicles,     setVehicles]     = useState([])
  const [total,        setTotal]        = useState(0)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState(null)
  const [showImport,   setShowImport]   = useState(false)
  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [typeFilter,   setTypeFilter]   = useState('All')

  // ── Load fleet ──────────────────────────────────────────────────────────
  const loadFleet = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (search)                       params.set('search', search)
      if (statusFilter !== 'All')       params.set('status', statusFilter)
      if (typeFilter   !== 'All')       params.set('vehicle_type', typeFilter)
      params.set('limit', '100')

      const { data } = await api.get(`/api/fleet/vehicles?${params}`)
      setVehicles(data.vehicles)
      setTotal(data.total)
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not load fleet')
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter, typeFilter])

  useEffect(() => {
    loadFleet()
  }, [loadFleet])

  // ── Debounced search ────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(loadFleet, 350)
    return () => clearTimeout(timer)
  }, [search]) // eslint-disable-line

  return (
    <div className="flex flex-col gap-0">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-extrabold text-brand-white">Fleet</h2>
            <p className="text-gray-500 text-sm">
              {loading ? 'Loading…' : `${total} vehicle${total !== 1 ? 's' : ''}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadFleet}
              className="w-11 h-11 bg-brand-mid border border-brand-accent rounded-xl
                         flex items-center justify-center active:scale-95 transition-transform"
              aria-label="Refresh"
            >
              <RefreshCw className={`w-5 h-5 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-2 bg-brand-blue text-white
                         font-bold text-sm px-4 py-3 rounded-xl
                         active:scale-95 transition-transform"
            >
              <Upload className="w-4 h-4" />
              Import CSV
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search VIN, loaner #, make, model…"
            className="w-full bg-brand-mid border border-brand-accent rounded-xl
                       pl-10 pr-4 py-3 text-brand-white placeholder-gray-600
                       focus:outline-none focus:border-brand-blue transition-colors"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-2">
          {/* Status filter */}
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            <Filter className="w-4 h-4 text-gray-500 shrink-0 mt-1" />
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-full border transition-colors
                  ${statusFilter === s
                    ? 'bg-brand-blue border-brand-blue text-white'
                    : 'bg-brand-mid border-brand-accent text-gray-400'
                  }`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Type filter */}
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar pl-6">
            {TYPE_FILTERS.map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-full border transition-colors
                  ${typeFilter === t
                    ? 'bg-purple-700 border-purple-600 text-white'
                    : 'bg-brand-mid border-brand-accent text-gray-400'
                  }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Vehicle list ─────────────────────────────────────────────────── */}
      <div className="px-5 pb-6">
        <FleetTable
          vehicles={vehicles}
          loading={loading}
          error={error}
        />
      </div>

      {/* ── CSV Import Modal ─────────────────────────────────────────────── */}
      {showImport && (
        <CSVImportModal
          onClose={() => setShowImport(false)}
          onImportComplete={loadFleet}
        />
      )}
    </div>
  )
}
