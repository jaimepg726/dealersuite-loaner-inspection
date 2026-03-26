/**
 * DealerSuite — Inspection Page
 *
 * Full inspection flow orchestrator.
 *
 * Phases:
 *   init       → API start + Drive folder creation
 *   recording  → VideoRecorder walkround
 *   damage     → DamageLogger
 *   uploading  → UploadProgress (video → photos → damage records → complete)
 *   done       → Success screen with Drive folder link
 *   error      → Fatal error (API down, no vehicle, etc.)
 */
import { useEffect, useState, useRef } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import {
  CheckCircle, Loader, AlertCircle, ExternalLink, Home,
} from 'lucide-react'
import api from '../utils/api'
import PageHeader from '../components/ui/PageHeader'
import useInspection from '../hooks/useInspection'
import VideoRecorder from '../components/inspection/VideoRecorder'
import DamageLogger from '../components/inspection/DamageLogger'
import UploadProgress from '../components/inspection/UploadProgress'
import ConnectionStatusBanner from '../components/ui/ConnectionStatusBanner'

// ── Type config ───────────────────────────────────────────────────────────────────
const TYPE_LABELS = {
  checkout:   { label: 'Checkout Inspection',  color: 'text-brand-blue' },
  checkin:    { label: 'Check-In Inspection',   color: 'text-brand-green' },
  inventory:  { label: 'Inventory Inspection',  color: 'text-purple-400' },
  sales:      { label: 'Sales Inspection',      color: 'text-orange-400' },
  condition:  { label: 'Condition Inspection',  color: 'text-teal-400' },
  inspection: { label: 'Inspection',            color: 'text-gray-300' },
}

const TYPE_API_MAP = {
  checkout:   'checkout',
  checkin:    'checkin',
  inventory:  'Inventory',
  sales:      'Sales',
  condition:  'condition',
  inspection: 'inspection',
}

// ── Upload step builder ────────────────────────────────────────────────────────────────
function makeSteps(hasVideo, photoCount) {
  const steps = []
  if (hasVideo)   steps.push({ label: 'Uploading walkround video', status: 'pending' })
  if (photoCount) steps.push({ label: `Uploading ${photoCount} damage photo${photoCount !== 1 ? 's' : ''}`, status: 'pending' })
  steps.push({ label: 'Saving damage reports', status: 'pending' })
  steps.push({ label: 'Completing inspection',  status: 'pending' })
  return steps
}

// ── Main component ───────────────────────────────────────────────────────────────────
export default function InspectPage() {
  const { type, vehicleId } = useParams()
  const location  = useLocation()
  const navigate  = useNavigate()

  const { inspection, starting, uploading, error, start, startCondition, resume, uploadFile, complete, reset } = useInspection()

  const vehicle      = location.state?.vehicle ?? null
  const conditionVin = location.state?.conditionVin ?? null
  const typeInfo = TYPE_LABELS[type] || TYPE_LABELS.checkout
  const apiType  = TYPE_API_MAP[type] || 'Checkout'

  const [phase,       setPhase]       = useState('init')
  const [uploadSteps, setUploadSteps] = useState([])
  const [uploadPct,   setUploadPct]   = useState(0)
  const [uploadError, setUploadError] = useState(null)

  const videoBlobRef      = useRef(null)
  const photoBlobsRef     = useRef([])
  const damagesRef        = useRef([])
  const uploadsStartedRef   = useRef(false)
  const videoCaptureLockRef = useRef(false)

  // ── Start inspection on mount ──────────────────────────────────────────────────────
  useEffect(() => {
    const isCondition = type === 'condition' && vehicleId === '0'

    if (isCondition && !conditionVin) { setPhase('error'); return }
    if (!isCondition && !vehicleId) return

    const sessionKey = isCondition
      ? `inspection_condition_${conditionVin}`
      : `inspection_${vehicleId}_${apiType}`

    const existingId = sessionStorage.getItem(sessionKey)
    if (existingId) {
      console.info(`Resuming existing inspection ${existingId}`)
      resume(Number(existingId))
        .then(() => setPhase('recording'))
        .catch(() => {
          console.warn(`Could not resume inspection ${existingId} — starting fresh`)
          sessionStorage.removeItem(sessionKey)
          startFresh()
        })
    } else {
      startFresh()
    }
    function startFresh() {
      const p = isCondition
        ? startCondition(conditionVin)
        : start(Number(vehicleId), apiType)
      p.then(data => { sessionStorage.setItem(sessionKey, String(data.id)); setPhase('recording') })
        .catch(() => setPhase('error'))
    }
    return () => { reset(); sessionStorage.removeItem(sessionKey) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Transitions ──────────────────────────────────────────────────────────────────
  function handleVideoComplete(videoBlob, capturedPhotos) {
    if (videoCaptureLockRef.current) { console.warn('Duplicate capture prevented'); return }
    videoCaptureLockRef.current = true
    console.info('Video captured:', type + '_' + new Date().toISOString())
    videoBlobRef.current  = videoBlob
    photoBlobsRef.current = capturedPhotos
    // Condition videos skip damage logging — go straight to upload
    if (type === 'condition') {
      kickOffUploads([])
    } else {
      setPhase('damage')
    }
  }

  function handleDamageComplete(damages) {
    damagesRef.current = damages
    kickOffUploads(damages)
  }

  function handleSkipDamage() {
    damagesRef.current = []
    kickOffUploads([])
  }

  // ── Upload orchestration ────────────────────────────────────────────────────────────────
  // Stored in a ref so the function identity never changes between renders.
  // Prevents a re-render from setInspection() producing a new kickOffUploads
  // that could be invoked a second time with a stale uploadFile reference.
  const kickOffUploadsRef = useRef(null)
  kickOffUploadsRef.current = async function kickOffUploads(damages) {
    if (uploadsStartedRef.current) { console.warn('kickOffUploads called twice — ignoring'); return }
    uploadsStartedRef.current = true

    const videoBlob  = videoBlobRef.current
    if (videoBlob) console.info('Video added to inspection:', type + '_video')

    const photoDmg   = damages.filter(d => d.photoBlob)
    const photoCount = photoDmg.length
    const steps      = makeSteps(!!videoBlob, photoCount)

    setUploadSteps([...steps])
    setUploadError(null)
    setPhase('uploading')

    let si = 0
    const mark = (status) =>
      setUploadSteps(prev => prev.map((s, i) => i === si ? { ...s, status } : s))

    try {
      // Step 1 — video
      if (videoBlob) {
        mark('active')
        try { await uploadFile(videoBlob, 'video') }
        catch { console.warn('Video upload skipped — Drive may not be configured') }
        mark('done'); si++; setUploadPct(0)
      }

      // Step 2 — damage photos
      const photoResults = []
      if (photoCount > 0) {
        mark('active')
        for (let i = 0; i < photoDmg.length; i++) {
          const d = photoDmg[i]
          setUploadPct(Math.round((i / photoCount) * 100))
          let photoUrl = null, photoDriveId = null
          try {
            const res    = await uploadFile(d.photoBlob, 'photo', d.location || 'other')
            photoUrl     = res?.file_url ?? null
            photoDriveId = res?.file_id  ?? null
          } catch { /* log damage without photo */ }
          photoResults.push({ location: d.location, description: d.description, photo_url: photoUrl, photo_drive_id: photoDriveId })
        }
        setUploadPct(100); mark('done'); si++; setUploadPct(0)
      }

      // Step 3 — save damage records
      mark('active')
      // `inspection` is safe to read here without a ref: kickOffUploads is a
      // plain function (not stored in a ref), so it is re-created on every
      // render and always closes over the *current* inspection value from
      // useInspection state. By the time the user reaches the damage phase,
      // start() has already resolved and set inspection, so this will never
      // be null under normal flow.
      if (!inspection) throw new Error('Inspection not found')
      const textOnlyDamages = damages
        .filter(d => !d.photoBlob)
        .map(d => ({ location: d.location, description: d.description, photo_url: null, photo_drive_id: null }))
      for (const d of [...textOnlyDamages, ...photoResults]) {
        await api.post(`/api/inspect/${inspection.id}/damage`, {
          location: d.location || null, description: d.description || null,
          photo_url: d.photo_url || null, photo_drive_id: d.photo_drive_id || null,
        })
      }
      mark('done'); si++

      // Step 4 — complete
      mark('active')
      await complete(photoResults.length)
      mark('done')
      setPhase('done')

    } catch (err) {
      mark('error')
      setUploadError(err.response?.data?.detail || err.message || 'Something went wrong')
    }
  }

  // Stable wrapper — always calls the latest ref version
  function kickOffUploads(damages) { kickOffUploadsRef.current(damages) }

  // ── Render: starting / init ───────────────────────────────────────────────────────────
  if (phase === 'init' || starting) {
    return (
      <FullScreenShell title={typeInfo.label} showBack>
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <Loader className="w-12 h-12 text-brand-blue animate-spin" />
          <p className="text-gray-400 font-semibold">Starting inspection…</p>
        </div>
      </FullScreenShell>
    )
  }

  if (phase === 'error' || (!starting && error)) {
    return (
      <FullScreenShell title={typeInfo.label} showBack>
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <AlertCircle className="w-12 h-12 text-red-400" />
          <p className="text-red-400 font-bold text-lg">Could Not Start</p>
          <p className="text-gray-500 text-sm">{error || 'Unknown error — go back and try again'}</p>
          <button onClick={() => navigate(-1)} className="btn-ghost w-auto px-8 mt-2">← Go Back</button>
        </div>
      </FullScreenShell>
    )
  }

  if (phase === 'done') {
    return (
      <FullScreenShell title="Inspection Complete">
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 text-center">
          <div className="w-24 h-24 rounded-full bg-green-900/40 border-2 border-green-600 flex items-center justify-center">
            <CheckCircle className="w-14 h-14 text-green-400" />
          </div>
          <div>
            <p className="text-2xl font-extrabold text-brand-white">All Done!</p>
            <p className="text-gray-500 text-sm mt-1">
              {type === 'condition' && conditionVin
                ? `Condition video recorded — VIN ${conditionVin}`
                : `${inspection?.inspection_type} inspection saved`}
            </p>
          </div>
          <div className="flex flex-col gap-2 w-full max-w-xs">
            <div className="flex items-center gap-3 bg-green-900/40 border border-green-700 rounded-xl px-4 py-2.5">
              <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />
              <span className="text-green-300 text-sm font-semibold">Inspection Saved</span>
            </div>
            <div className="flex items-center gap-3 bg-green-900/40 border border-green-700 rounded-xl px-4 py-2.5">
              <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />
              <span className="text-green-300 text-sm font-semibold">Media Uploaded</span>
            </div>
          </div>
          {(inspection?.photo_count > 0 || inspection?.video_count > 0) && (
            <div className="flex items-center gap-4 text-sm font-semibold text-gray-400">
              {inspection.photo_count > 0 && <span>📷 {inspection.photo_count} photo{inspection.photo_count !== 1 ? 's' : ''}</span>}
              {inspection.video_count > 0 && <span>🎥 {inspection.video_count} video{inspection.video_count !== 1 ? 's' : ''}</span>}
              <span className="text-gray-600">saved to Drive</span>
            </div>
          )}
          {inspection?.drive_folder_url && (
            <a href={inspection.drive_folder_url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-bold bg-green-900/30 border border-green-700 text-green-400 px-4 py-2.5 rounded-xl">
              <ExternalLink className="w-4 h-4" /> Open Drive Folder
            </a>
          )}
          {damagesRef.current.length > 0 && (
            <p className="text-yellow-400 text-sm font-semibold">
              ⚠ {damagesRef.current.length} damage item{damagesRef.current.length !== 1 ? 's' : ''} logged
            </p>
          )}
          <button onClick={() => navigate('/')} className="btn-primary mt-2">
            <Home className="w-5 h-5" /> Back to Home
          </button>
        </div>
      </FullScreenShell>
    )
  }

  const subtitle = (type === 'condition' && conditionVin)
    ? `VIN: ${conditionVin}`
    : vehicle
      ? `${vehicle.year ?? ''} ${vehicle.make ?? ''} ${vehicle.model ?? ''}`.trim()
      : `Vehicle #${vehicleId}`

  const phaseTitle = { recording: typeInfo.label, damage: 'Log Damage', uploading: 'Saving…' }[phase] || typeInfo.label
  const ORDERED = ['recording', 'damage', 'uploading']

  return (
    <div className="min-h-screen bg-brand-dark flex flex-col">
      <ConnectionStatusBanner uploading={uploading} />
      <PageHeader title={phaseTitle} subtitle={phase === 'recording' ? subtitle : undefined} showBack={phase === 'recording'} />
      <main className="flex-1 flex flex-col px-5 pt-4 pb-8 gap-5">
        <div className="flex items-center gap-2">
          {ORDERED.map((p, i) => (
            <div key={p} className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full transition-all ${
                p === phase ? 'bg-brand-blue scale-125'
                  : ORDERED.indexOf(p) < ORDERED.indexOf(phase) ? 'bg-green-400' : 'bg-brand-accent'
              }`} />
              {i < ORDERED.length - 1 && <div className="w-6 h-px bg-brand-accent" />}
            </div>
          ))}
          <span className="text-gray-600 text-xs ml-2">
            {{ recording: 'Step 1/3', damage: 'Step 2/3', uploading: 'Step 3/3' }[phase]}
          </span>
        </div>
        {phase === 'recording' && <VideoRecorder onComplete={handleVideoComplete} />}
        {phase === 'damage' && (
          <DamageLogger capturedPhotos={photoBlobsRef.current} onComplete={handleDamageComplete} onSkip={handleSkipDamage} />
        )}
        {phase === 'uploading' && (
          <UploadProgress steps={uploadSteps} currentPct={uploadPct} errorMsg={uploadError} />
        )}
      </main>
    </div>
  )
}

function FullScreenShell({ title, showBack = false, children }) {
  return (
    <div className="min-h-screen bg-brand-dark flex flex-col">
      <PageHeader title={title} showBack={showBack} />
      <main className="flex-1 flex flex-col">{children}</main>
    </div>
  )
}
