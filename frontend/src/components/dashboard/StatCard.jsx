/**
 * DealerSuite — Stat Card
 * Single KPI tile used on the Reports and Inspections tabs.
 */
export default function StatCard({ label, value, sub, color = 'blue', icon: Icon }) {
  const colorMap = {
    blue:   'bg-brand-blue/10   border-brand-blue/30   text-brand-blue',
    green:  'bg-green-900/30    border-green-800       text-green-400',
    red:    'bg-red-900/30      border-red-800         text-red-400',
    yellow: 'bg-yellow-900/30   border-yellow-800      text-yellow-400',
    purple: 'bg-purple-900/30   border-purple-800      text-purple-400',
    gray:   'bg-brand-accent/50 border-brand-accent    text-gray-400',
  }

  const cls = colorMap[color] || colorMap.blue

  return (
    <div className={`border rounded-2xl p-4 flex flex-col gap-1 ${cls.split(' ').slice(0, 2).join(' ')}`}>
      {Icon && <Icon className={`w-5 h-5 mb-1 ${cls.split(' ')[2]}`} />}
      <p className={`text-3xl font-extrabold ${cls.split(' ')[2]}`}>{value ?? '—'}</p>
      <p className="text-brand-white text-sm font-semibold leading-tight">{label}</p>
      {sub && <p className="text-gray-500 text-xs">{sub}</p>}
    </div>
  )
}
