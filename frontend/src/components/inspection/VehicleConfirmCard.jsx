/**
 * DealerSuite — Vehicle Confirm Card
 * Shown after a VIN lookup succeeds.
 * Porter confirms this is the right vehicle before picking inspection type.
 */

import { CheckCircle, XCircle, Car } from 'lucide-react'

export default function VehicleConfirmCard({ vehicle, onConfirm, onReject }) {
  return (
    <div className="flex flex-col gap-5 w-full max-w-sm mx-auto">

      {/* Vehicle details card */}
      <div className="card border-brand-blue/40 bg-brand-blue/10">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 bg-brand-blue/20 rounded-2xl flex items-center justify-center shrink-0">
            <Car className="w-8 h-8 text-brand-blue" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-brand-blue font-semibold uppercase tracking-widest mb-1">
              Vehicle Found
            </p>
            <h2 className="text-xl font-extrabold text-brand-white leading-tight">
              {vehicle.year} {vehicle.make} {vehicle.model}
            </h2>
            <p className="text-gray-400 text-sm mt-1">
              Loaner #{vehicle.loaner_number || '—'} &nbsp;·&nbsp; {vehicle.plate || 'No plate'}
            </p>
          </div>
        </div>

        {/* VIN row */}
        <div className="mt-4 bg-brand-dark/50 rounded-xl px-4 py-3">
          <p className="text-xs text-gray-500 mb-1">VIN</p>
          <p className="text-brand-white font-mono text-sm tracking-widest">{vehicle.vin}</p>
        </div>

        {/* Status badge */}
        <div className="mt-3 flex items-center gap-2">
          <span className={`px-3 py-1 rounded-full text-xs font-bold
            ${vehicle.status === 'Active'
              ? 'bg-green-900/60 text-green-400 border border-green-700'
              : 'bg-yellow-900/60 text-yellow-400 border border-yellow-700'
            }`}
          >
            {vehicle.status}
          </span>
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-brand-accent text-gray-300 border border-brand-accent">
            {vehicle.vehicle_type}
          </span>
        </div>
      </div>

      {/* Confirm question */}
      <p className="text-center text-brand-white text-lg font-bold">
        Is this the right vehicle?
      </p>

      {/* Buttons */}
      <div className="flex gap-3">
        <button
          onClick={onReject}
          className="btn-danger flex-1"
        >
          <XCircle className="w-6 h-6" />
          No, Rescan
        </button>
        <button
          onClick={() => onConfirm(vehicle)}
          className="btn-success flex-1"
        >
          <CheckCircle className="w-6 h-6" />
          Yes, Continue
        </button>
      </div>
    </div>
  )
}
