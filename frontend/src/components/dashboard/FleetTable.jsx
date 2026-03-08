/**
 * DealerSuite — Fleet Table
 * Renders the list of vehicles for the manager fleet tab.
 * Mobile-friendly card layout (no horizontal scrolling on iPad).
 */

import { Car, AlertCircle } from 'lucide-react'

const STATUS_STYLE = {
  Active:      'bg-green-900/60 text-green-400 border-green-700',
  Retired:     'bg-gray-800     text-gray-500  border-gray-700',
  'In Service':'bg-yellow-900/60 text-yellow-400 border-yellow-700',
}

const TYPE_STYLE = {
  Loaner:    'bg-brand-blue/20 text-brand-blue',
  Inventory: 'bg-purple-900/50 text-purple-400',
  Sales:     'bg-orange-900/50 text-orange-400',
}

function VehicleCard({ vehicle }) {
  const statusCls = STATUS_STYLE[vehicle.status] || STATUS_STYLE.Active
  const typeCls   = TYPE_STYLE[vehicle.vehicle_type]  || TYPE_STYLE.Loaner

  return (
    <div className="card flex items-start gap-4 hover:border-brand-blue/40 transition-colors">
      {/* Icon */}
      <div className="w-12 h-12 bg-brand-accent rounded-xl flex items-center justify-center shrink-0">
        <Car className="w-6 h-6 text-gray-400" />
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {vehicle.loaner_number && (
            <span className="text-xs font-bold text-gray-400">#{vehicle.loaner_number}</span>
          )}
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${typeCls}`}>
            {vehicle.vehicle_type}
          </span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${statusCls}`}>
            {vehicle.status}
          </span>
        </div>

        <p className="text-brand-white font-bold mt-1 leading-tight">
          {vehicle.year} {vehicle.make} {vehicle.model}
        </p>

        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <span className="text-gray-500 text-xs font-mono">{vehicle.vin}</span>
          {vehicle.plate && (
            <span className="text-gray-400 text-xs">🚘 {vehicle.plate}</span>
          )}
          {vehicle.mileage != null && (
            <span className="text-gray-500 text-xs">
              {vehicle.mileage.toLocaleString()} mi
            </span>
          )}
        </div>
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
