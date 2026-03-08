/**
 * Manager bottom navigation bar.
 * Fixed to the bottom of the screen — large tap targets.
 */
import { NavLink } from 'react-router-dom'
import { Car, ClipboardList, AlertTriangle, BarChart2, Settings } from 'lucide-react'

const TABS = [
  { to: '/dashboard/fleet',    label: 'Fleet',      Icon: Car            },
  { to: '/dashboard',          label: 'Inspections', Icon: ClipboardList  },
  { to: '/dashboard/damage',   label: 'Damage',     Icon: AlertTriangle  },
  { to: '/dashboard/reports',  label: 'Reports',    Icon: BarChart2      },
  { to: '/dashboard/settings', label: 'Settings',   Icon: Settings       },
]

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-brand-mid border-t border-brand-accent
                    flex items-center justify-around
                    pb-safe"   /* pb-safe honours iOS home-bar inset */
    >
      {TABS.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/dashboard'}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center gap-1 py-3 px-2 flex-1
             text-xs font-semibold transition-colors
             ${isActive ? 'text-brand-blue' : 'text-gray-500'}`
          }
        >
          {({ isActive }) => (
            <>
              <Icon className={`w-6 h-6 ${isActive ? 'text-brand-blue' : 'text-gray-500'}`} />
              <span>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
