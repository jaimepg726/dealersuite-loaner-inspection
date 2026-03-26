/**
 * AuthDriveImage — authenticated Google Drive image loader.
 *
 * For Drive-hosted files:
 *   1. GET /api/media/{id}/drive-token  (Railway — tiny JSON, no bytes)
 *   2. fetch(drive_url, Authorization header)  (browser → Google directly)
 *   3. createObjectURL(blob) → render <img>
 *
 * For legacy DB URLs (non-Drive): renders a plain <img> directly.
 *
 * Exports:
 *   isDriveUrl(url)       — utility used by InspectionDetail
 *   fetchDriveBlob(id)    — utility used by InspectionDetail PhotoModal
 *   default AuthDriveImage — the component
 */

import { useState, useEffect, useRef } from 'react'
import { Loader, WifiOff } from 'lucide-react'
import api from '../../utils/api'

export function isDriveUrl(url) {
  return Boolean(url && url.includes('drive.google.com'))
}

export async function fetchDriveBlob(mediaId) {
  const { data } = await api.get(`/api/media/${mediaId}/drive-token`)
  // Use raw fetch — NOT the api instance — so the DealerSuite JWT is not
  // forwarded to Google and the Railway base URL is not prepended.
  const resp = await fetch(data.drive_url, {
    headers: { Authorization: `Bearer ${data.access_token}` },
  })
  if (!resp.ok) throw new Error(`Drive fetch failed: ${resp.status}`)
  const blob = await resp.blob()
  return { objectUrl: URL.createObjectURL(blob), mimeType: data.mime_type }
}

/**
 * Props:
 *   mediaId  — InspectionMedia record ID (used for the drive-token endpoint)
 *   fileUrl  — stored file URL (Drive or legacy)
 *   alt      — img alt text
 *   className — CSS class applied to both the img and the skeleton/error placeholder
 *   onClick  — optional click handler on the img
 */
export default function AuthDriveImage({
  mediaId,
  fileUrl,
  alt = 'Image',
  className = '',
  onClick,
}) {
  const [src,     setSrc]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)
  const objUrlRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    setSrc(null)

    if (isDriveUrl(fileUrl)) {
      fetchDriveBlob(mediaId)
        .then(({ objectUrl }) => {
          if (cancelled) { URL.revokeObjectURL(objectUrl); return }
          objUrlRef.current = objectUrl
          setSrc(objectUrl)
          setLoading(false)
        })
        .catch(() => {
          if (!cancelled) { setError(true); setLoading(false) }
        })
    } else {
      // Legacy DB record — plain URL, no auth required
      setSrc(fileUrl)
      setLoading(false)
    }

    return () => {
      cancelled = true
      if (objUrlRef.current) {
        URL.revokeObjectURL(objUrlRef.current)
        objUrlRef.current = null
      }
    }
  }, [mediaId, fileUrl])

  if (loading) {
    return (
      <div className={`flex items-center justify-center bg-brand-mid ${className}`}>
        <Loader className="w-5 h-5 text-brand-blue animate-spin" />
      </div>
    )
  }

  if (error || !src) {
    return (
      <div className={`flex items-center justify-center bg-brand-mid ${className}`}>
        <WifiOff className="w-5 h-5 text-gray-500" />
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onClick={onClick}
      style={onClick ? { cursor: 'pointer' } : undefined}
    />
  )
}
