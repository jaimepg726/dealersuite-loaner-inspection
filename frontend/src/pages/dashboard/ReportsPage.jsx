/**
 * DealerSuite — Manager Reports Tab
 * KPI stats grid pulled from GET /api/manager/stats.
 * Shows inspection totals, damage summary, and breakdown by type.
 */
import { useState, useEffect, useCallback } from 'react'
import {
  RefreshCw,
  BarChart2,
  Car,
  ClipboardList,
  AlertTriangle,
  CheckCircle,
  Clock,
  Wrench,
} from 'lucide-react'
import api from '../../utils/api'
import StatCard from '../../components/dashboard/StatCard'

// ── Helpers ─────────────────────────────────────────────────────────────────

function SectionTitle({ children }) {
  return (
    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 mt-1">
      {children}
    </p>
  )
}

function ByTypeRow({ label, count, color }) {
  const dotColor = {
    blue:   'bg-brand-blue',
    purple: 'bg-purple-500',
    orange: 'bg-orange-400',
    green:  'bg-green-400',
    gray:   'bg-gray-500',
  }[color] || 'bg-gray-500'

  return (
    <div className="flex items-center justify-between py-2.5 border-b border-brand-accent last:border-0">
      <div className="flex items-center gap-2">
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotColor}`} />
        <span className="text-gray-300 text-sm font-semibold">{label}</span>
      </div>
      <span className="text-brand-white font-extrabold tabular-nums">{count ?? 0}</span>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [stats,   setStats]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get('/api/manager/stats')
      setStats(data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not load stats')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="flex flex-col">

      {/* Header */}
      <div className="px-5 pt-5 pb-4 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-brand-white">Reports</h2>
          <p className="text-gray-500 text-sm">
            {loading ? 'Loading…' : 'Live shop stats'}
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

      {/* Error */}
      {!loading && error && (
        <div className="px-5 pb-6">
          <p className="text-red-400 text-sm text-center py-8">{error}</p>
        </div>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div className="px-5 pb-6 flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="rounded-2xl h-28 animate-pulse bg-brand-mid" />
            ))}
          </div>
          <div className="rounded-2xl h-40 animate-pulse bg-brand-mid" />
          <div className="rounded-2xl h-32 animate-pulse bg-brand-mid" />
        </div>
      )}

      {/* Stats grid */}
      {!loading && stats && (
        <div className="px-5 pb-6 flex flex-col gap-5">

          {/* ── Inspections ────────────────────────────────────────────── */}
          <div>
            <SectionTitle>Inspections</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label="All Time"
                value={stats.total_inspections}
                color="blue"
                icon={ClipboardList}
              />
              <StatCard
                label="This Week"
                value={stats.this_week}
                sub="past 7 days"
                color="blue"
                icon={BarChart2}
              />
              <StatCard
                label="Completed"
                value={stats.completed}
                color="green"
                icon={CheckCircle}
              />
              <StatCard
                label="In Progress"
                value={stats.in_progress}
                color="yellow"
                icon={Clock}
              />
            </div>
          </div>

          {/* ── Fleet ──────────────────────────────────────────────────── */}
          <div>
            <SectionTitle>Fleet</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label="Active Vehicles"
                value={stats.total_vehicles}
                color="purple"
                icon={Car}
              />
              <StatCard
                label="This Month"
                value={stats.this_month}
                sub="past 30 days"
                color="gray"
                icon={BarChart2}
              />
            </div>
          </div>

          {/* ── Damage ─────────────────────────────────────────────────── */}
          <div>
            <SectionTitle>Damage Queue</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label="Open Items"
                value={stats.open_damage}
                color={stats.open_damage > 0 ? 'red' : 'green'}
                icon={AlertTriangle}
              />
              <StatCard
                label="RO Assigned"
                value={stats.ro_assigned}
                color="yellow"
                icon={Wrench}
              />
            </div>
          </div>

          {/* ── By Type ────────────────────────────────────────────────── */}
          {stats.by_type && Object.keys(stats.by_type).length > 0 && (
            <div>
              <SectionTitle>Inspections by Type</SectionTitle>
              <div className="card">
                {[
                  { key: 'Checkout',  color: 'blue'   },
                  { key: 'Checkin',   color: 'green'  },
                  { key: 'Inventory', color: 'purple' },
                  { key: 'Sales',     color: 'orange' },
                ].map(({ key, color }) => (
                  stats.by_type[key] != null && (
                    <ByTypeRow
                      key={key}
                      label={key}
                      count={stats.by_type[key]}
                      color={color}
                    />
                  )
                ))}
              </div>
            </div>
          )}

          {/* Footer note */}
          <p className="text-gray-600 text-xs text-center pb-2">
            Stats refresh each time you open this tab
          </p>
        </div>
      )}
    </div>
  )
}
