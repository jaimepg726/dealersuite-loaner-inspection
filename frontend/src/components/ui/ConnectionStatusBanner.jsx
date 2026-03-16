/**
 * ConnectionStatusBanner — shows offline or uploading state at the top of a page.
 *
 * States:
 *   online  + not uploading → hidden (renders nothing)
 *   offline                 → 🟡 amber "Offline" bar
 *   online  + uploading     → 🔵 blue "Uploading media…" bar
 *
 * Props:
 *   uploading — boolean, driven by useInspection().uploading
 */
import { useState, useEffect } from 'react'

export default function ConnectionStatusBanner({ uploading = false }) {
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const goOnline  = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online',  goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online',  goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  // Nothing to show
  if (online && !uploading) return null

  if (!online) {
    return (
      <div className="w-full bg-yellow-900/70 border-b border-yellow-700
                      px-4 py-2 flex items-center gap-2.5
                      text-yellow-200 text-sm font-semibold">
        <span className="w-2 h-2 rounded-full bg-yellow-400 shrink-0" />
        Offline — uploads will resume when connected
      </div>
    )
  }

  // online && uploading
  return (
    <div className="w-full bg-blue-900/70 border-b border-blue-700
                    px-4 py-2 flex items-center gap-2.5
                    text-blue-200 text-sm font-semibold">
      <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shrink-0" />
      Uploading media…
    </div>
  )
}
