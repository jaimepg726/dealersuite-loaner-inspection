/**
 * DriveStatusBadge - small pill shown in the manager header
 * Shows: Drive Connected | Local Fallback | Drive Degraded
 */
import { useState, useEffect } from 'react'
import { HardDrive, WifiOff, AlertTriangle } from 'lucide-react'
import api from '../../utils/api'

export default function DriveStatusBadge() {
  const [status, setStatus] = useState(null)

  useEffect(() => {
    api.get('/api/auth/google/status')
      .then(({ data }) => setStatus(data))
      .catch(() => setStatus(null))
  }, [])

  if (!status) return null

  if (status.connected && !status.token_expired) {
    return (
      <span className="flex items-center gap-1 text-xs font-bold text-green-400 bg-green-400/10 border border-green-400/20 px-2.5 py-1 rounded-full">
        <HardDrive className="w-3 h-3" />
        Drive Connected
      </span>
    )
  }

  if (status.connected && status.token_expired) {
    return (
      <span className="flex items-center gap-1 text-xs font-bold text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 px-2.5 py-1 rounded-full">
        <AlertTriangle className="w-3 h-3" />
        Drive Degraded
      </span>
    )
  }

  return (
    <span className="flex items-center gap-1 text-xs font-bold text-gray-400 bg-gray-400/10 border border-gray-400/20 px-2.5 py-1 rounded-full">
      <WifiOff className="w-3 h-3" />
      Local Fallback
    </span>
  )
}
