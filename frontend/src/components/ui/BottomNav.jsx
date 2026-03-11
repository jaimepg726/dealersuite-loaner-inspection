/**
 * Manager bottom navigation bar.
 * Fixed to the bottom of the screen — large tap targets.
 */
import { NavLink } from 'react-router-dom'
import { Car, ClipboardList, Camera, AlertTriangle, Settings } from 'lucide-react'

const TABS = [
  { to: '/dashboard/fleet',       label: 'Fleet',       Icon: Car           },
  { to: '/dashboard',             label: 'Inspections', Icon: ClipboardList },
  { to: '/scan',                  label: 'Inspect',     Icon: Camera        },
  { to: '/dashboard/damage',      label: 'Damage',      Icon: AlertTriangle },
  { to: '/dashboard/settings',    label: 'Settings',    Icon: Settings      },
]

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-brand-mid border-t border-brand-accent
                    flex items-center justify-around
                    pb-safe"
    >
      {TABS.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/dashboard'}
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 px-3 py-2 text-[10px] font-bold tracking-wide transition-colors ${
              isActive ? 'text-brand-blue' : 'text-gray-500'
            }`
          }
        >
          <Icon className="w-6 h-6" strokeWidth={isActive => isActive ? 2.5 : 1.8} />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}