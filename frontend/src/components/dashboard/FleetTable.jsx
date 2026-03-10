/**
 * DealerSuite — Fleet Table
 * Renders the list of vehicles for the manager fleet tab.
 * Mobile-friendly card layout (no horizontal scrolling on iPad).
 * Step 23: Loaner number dominant, plate + fuel prominent.
 */

import { Car, AlertCircle, Fuel } from 'lucide-react'

const STATUS_STYLE = {
  Active:       'bg-green-900/60  text-green-400  border-green-700',
  Retired:      'bg-gray-800      text-gray-500   border-gray-700',
  'In Service': 'bg-yellow-900/60 text-yellow-400 border-yellow-700',
  'In Use':     'bg-blue-900/60   text-blue-300   border-blue-700',
}

const FUEL_COLOR = {
  F:    'text-green-400',
  '3/4':'text-green-400',
  '1/2':'text-yellow-400',
  '1/4':'text-orange-400',
  E:    'text-red-400',
}

function VehicleCard({ vehicle }) {
  const statusCls = STATUS_STYLE[vehicle.status] || STATUS_STYLE.Active
  const fuelColor = FUEL_COLOR[vehicle.fuel_level] || 'text-gray-400'

  return (
    <div className="card hover:border-brand-blue/40 transition-colors">

      {/* ── Top row: loaner number (dominant) + status badge ── */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-2xl font-extrabold text-brand-white tracking-tight leading-none">
          {vehicle.loaner_number || '—'}
        </span>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${statusCls}`}>
          {vehicle.status}
        </span>
      </div>

      {/* ── Year / Make / Model ── */}
      <p className="text-gray-300 font-semibold text-sm leading-snug mb-2">
        {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')}
      </p>

      {/* ── Bottom row: plate · fuel · mileage ── */}
      <div className="flex items-center gap-4 text-xs flex-wrap">
        {vehicle.plate && (
          <span className="font-mono font-bold text-gray-300 bg-brand-accent px-2 py-0.5 rounded">
            {vehicle.plate}
          </span>
        )}
        {vehicle.fuel_level && (
          <span className={`flex items-center gap-1 font-bold ${fuelColor}`}>
            <Fuel className="w-3.5 h-3.5" />
            {vehicle.fuel_level}
          </span>
        )}
        {vehicle.mileage != null && (
          <span className="text-gray-500">
            {vehicle.mileage.toLocaleString()} mi
          </span>
        )}
      </div>
    </div>
  )
}

export default function FleetTable({ vehicles, loading, error }) {
  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="card animate-pulse h-20 bg-brand-mid" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <AlertCircle className="w-10 h-10 text-brand-red" />
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    )
  }

  if (!vehicles || vehicles.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <Car className="w-14 h-14 text-brand-accent" strokeWidth={1} />
        <p className="text-gray-400 font-semibold">No vehicles in fleet yet</p>
        <p className="text-gray-600 text-sm">Import a CSV from TSD Dealer to get started</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {vehicles.map((v) => (
        <VehicleCard key={v.id} vehicle={v} />
      ))}
    </div>
  )
}
