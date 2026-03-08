/**
 * DealerSuite — Select Inspection Type
 * After VIN is confirmed, porter picks Checkout or Check-In.
 * Large, icon-driven buttons — no reading required.
 */

import { useLocation, useNavigate } from 'react-router-dom'
import { LogOut, LogIn, Package, Tag } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'

const TYPES = [
  {
    type:    'checkout',
    label:   'Checkout',
    sub:     'Customer taking loaner',
    Icon:    LogOut,
    color:   'bg-brand-blue hover:bg-brand-blue/80',
    iconBg:  'bg-white/20',
  },
  {
    type:    'checkin',
    label:   'Check-In',
    sub:     'Customer returning loaner',
    Icon:    LogIn,
    color:   'bg-brand-green hover:bg-brand-green/80',
    iconBg:  'bg-white/20',
  },
  {
    type:    'inventory',
    label:   'Inventory',
    sub:     'Stock vehicle inspection',
    Icon:    Package,
    color:   'bg-purple-700 hover:bg-purple-600',
    iconBg:  'bg-white/20',
  },
  {
    type:    'sales',
    label:   'Sales',
    sub:     'Sales department vehicle',
    Icon:    Tag,
    color:   'bg-orange-700 hover:bg-orange-600',
    iconBg:  'bg-white/20',
  },
]

export default function SelectInspectionTypePage() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const vehicle   = location.state?.vehicle

  // Guard: if someone navigates here directly without a vehicle
  if (!vehicle) {
    navigate('/scan', { replace: true })
    return null
  }

  function handleSelect(type) {
    navigate(`/inspect/${type}/${vehicle.id}`, { state: { vehicle } })
  }

  return (
    <div className="min-h-screen bg-brand-dark flex flex-col">
      <PageHeader
        title="Inspection Type"
        subtitle={`${vehicle.year} ${vehicle.make} ${vehicle.model} · ${vehicle.loaner_number || vehicle.vin.slice(-6)}`}
        showBack
      />

      <main className="flex-1 flex flex-col justify-center gap-4 px-5 pb-10">

        <p className="text-gray-400 text-sm text-center mb-2">
          What type of inspection is this?
        </p>

        {TYPES.map(({ type, label, sub, Icon, color, iconBg }) => (
          <button
            key={type}
            onClick={() => handleSelect(type)}
            className={`w-full ${color} rounded-2xl p-5 flex items-center gap-5
                        active:scale-[0.98] transition-transform select-none`}
          >
            <div className={`${iconBg} w-16 h-16 rounded-2xl flex items-center justify-center shrink-0`}>
              <Icon className="w-9 h-9 text-white" strokeWidth={1.5} />
            </div>
            <div className="text-left">
              <p className="text-white text-xl font-extrabold">{label}</p>
              <p className="text-white/70 text-sm">{sub}</p>
            </div>
          </button>
        ))}
      </main>
    </div>
  )
}
