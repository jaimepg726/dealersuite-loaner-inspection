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
import { t } from '../utils/lang'
import PageHeader from '../components/ui/PageHeader'
import useInspection from '../hooks/useInspection'
import useVideoSession from '../hooks/useVideoSession'
import VideoRecorder from '../components/inspection/VideoRecorder'
import DamageLogger from '../components/inspection/DamageLogger'
import UploadProgress from '../components/inspection/UploadProgress'
import ConnectionStatusBanner from '../components/ui/ConnectionStatusBanner'

// ── Type config (called at render time so t() reads current lang) ──────────────
function getTypeLabels() {
  return {
    checkout:   { label: t('Checkout Inspection',  'Inspección de Entrega'),    color: 'text-brand-blue' },
    checkin:    { label: t('Check-In Inspection',   'Inspección de Devolución'), color: 'text-brand-green' },
    inventory:  { label: t('Inventory Inspection',  'Inspección de Inventario'), color: 'text-purple-400' },
    sales:      { label: t('Sales Inspection',      'Inspección de Ventas'),     color: 'text-orange-400' },
    condition:  { label: t('Condition Inspection',  'Inspección de Condición'),  color: 'text-teal-400' },
    inspection: { label: t('Inspection',            'Inspección'),               color: 'text-gray-300' },
  }
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
function makeSteps(hasVideo, photoCount, isCondition = false) {
  const steps = []
  if (hasVideo)      steps.push({ label: isCondition
    ? t('Uploading condition video', 'Subiendo video de condición')
    : t('Uploading walkround video', 'Subiendo video de recorrido'),
    status: 'pending' })
  if (photoCount)    steps.push({ label: t(
    `Uploading ${photoCount} damage photo${photoCount !== 1 ? 's' : ''}`,
    `Subiendo ${photoCount} foto${photoCount !== 1 ? 's' : ''} de daños`
  ), status: 'pending' })
  if (!isCondition)  steps.push({ label: t('Saving damage reports', 'Guardando reportes de daños'), status: 'pending' })
  steps.push({ label: t('Completing inspection', 'Completando inspección'), status: 'pending' })
  return steps
}

// ── Main component ───────────────────────────────────────────────────────────────────
export default function InspectPage() {
  const { type, vehicleId } = useParams()
  const location  = useLocation()
  const navigate  = useNavigate()

  const { inspection, inspectionRef, starting, uploading, error, start, startCondition, uploadFile, complete, reset } = useInspection()
  const session = useVideoSession()

  const vehicle      = location.state?.vehicle ?? null
  const conditionVin = location.state?.conditionVin ?? null
  const TYPE_LABELS  = getTypeLabels()
  const typeInfo = TYPE_LABELS[type] || TYPE_LABELS.checkout
  const apiType  = TYPE_API_MAP[type] || 'Checkout'

  const [phase,          setPhase]          = useState('init')
  const [uploadSteps,    setUploadSteps]    = useState([])
  const [uploadPct,      setUploadPct]      = useState(0)
  const [uploadError,    setUploadError]    = useState(null)
  const [finalizeFailure, setFinalizeFailure] = useState(null)  // { inspectionId, finalizePayload, damages }
  const [finalizeRetrying, setFinalizeRetrying] = useState(false)

  const videoBlobRef      = useRef(null)
  const photoBlobsRef     = useRef([])
  const damagesRef        = useRef([])
  const geoDataRef        = useRef(null)
  const uploadsStartedRef   = useRef(false)
  const videoCaptureLockRef = useRef(false)

  // ── Validate params on mount, go straight to recording ────────────────────────────
  // The DB inspection row is NOT created here — it is created only after the porter
  // completes an actual recording (handleVideoComplete).  This prevents junk rows
  // from accumulating whenever a porter enters or exits the page without recording.
  useEffect(() => {
    const isCondition = type === 'condition' && vehicleId === '0'
    if (isCondition && !conditionVin) { setPhase('error'); return }
    if (!isCondition && !vehicleId) { setPhase('error'); return }
    setPhase('recording')
    const porterName = (() => {
      try { return JSON.parse(sessionStorage.getItem('currentUser') || 'null')?.name } catch { return null }
    })()
    session.createSession({
      inspectorName: porterName,
      loanerNumber:  vehicle?.loaner_number ?? null,
      inspectionType: type,
    })
    return () => { reset() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Warn before closing tab/app during upload ─────────────────────────────
  useEffect(() => {
    if (phase !== 'uploading') return
    const handleBeforeUnload = (e) => {
      e.preventDefault()
      e.returnValue = '' // required for Chrome; shows browser's own confirmation dialog
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [phase])

  // ── Transitions ──────────────────────────────────────────────────────────────────
  // handleVideoComplete is the FIRST point of real work — the DB row is created here.
  async function handleVideoComplete(videoBlob, capturedPhotos, geoData) {
    if (videoCaptureLockRef.current) { console.warn('Duplicate capture prevented'); return }
    videoCaptureLockRef.current = true
    console.info('Video captured:', type + '_' + new Date().toISOString())

    videoBlobRef.current  = videoBlob
    photoBlobsRef.current = capturedPhotos
    geoDataRef.current    = geoData ?? null

    // Create the inspection row now that the porter has done real work.
    // inspectionRef.current is set synchronously inside start/startCondition so
    // uploadFile can read it immediately without waiting for a React re-render.
    const isCondition = type === 'condition' && vehicleId === '0'
    try {
      if (isCondition) {
        await startCondition(conditionVin)
      } else {
        await start(Number(vehicleId), apiType)
      }
    } catch {
      videoCaptureLockRef.current = false
      setPhase('error')
      return
    }

    session.markInspectionCreated(inspectionRef.current?.id)

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

  // ── Finalize retry — called when porter taps "Try Again" after finalize failure ─────────
  async function handleFinalizeRetry() {
    if (!finalizeFailure || finalizeRetrying) return
    setFinalizeRetrying(true)
    try {
      await api.post(
        `/api/inspect/${finalizeFailure.inspectionId}/finalize-upload`,
        finalizeFailure.finalizePayload,
      )
      // Finalize succeeded — continue upload from after the video step.
      // Set videoBlob to null so kickOffUploads skips the video upload step,
      // then reset the guard and resume with stored damage data.
      const savedDamages = finalizeFailure.damages
      setFinalizeFailure(null)
      setFinalizeRetrying(false)
      videoBlobRef.current      = null   // video already in Drive — skip re-upload
      uploadsStartedRef.current = false  // reset guard so kickOffUploads can run again
      kickOffUploads(savedDamages)
    } catch {
      setFinalizeRetrying(false)
      // Keep showing the retry UI — porter can try again or go home
    }
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

    // Persist the in-progress inspection ID so PorterHome can detect an
    // abandoned upload if the porter closes the app before this completes.
    const pendingId = inspectionRef.current?.id
    if (pendingId) {
      try { sessionStorage.setItem('ds_upload_pending', String(pendingId)) } catch {}
    }

    const photoDmg   = damages.filter(d => d.photoBlob)
    const photoCount = photoDmg.length
    const steps      = makeSteps(!!videoBlob, photoCount, type === 'condition')

    setUploadSteps([...steps])
    setUploadError(null)
    session.markUploadStarted()
    setPhase('uploading')

    let si = 0
    const mark = (status) =>
      setUploadSteps(prev => prev.map((s, i) => i === si ? { ...s, status } : s))

    try {
      // Step 1 — video
      if (videoBlob) {
        mark('active')
        try { await uploadFile(videoBlob, 'video', null, geoDataRef.current) }
        catch (err) {
          if (err.finalizeFailedAfterUpload) {
            // Drive upload succeeded but finalize-upload failed after all retries.
            // Store retry metadata and pause — porter will use the Try Again UI.
            setFinalizeFailure({
              inspectionId:   err.inspectionId,
              finalizePayload: err.finalizePayload,
              damages,
            })
            return   // stop upload flow; do NOT mark done or call complete
          }
          console.warn('Video upload skipped — Drive may not be configured')
        }
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
      // Use inspectionRef.current (not the inspection state variable) so this
      // always reads the live value even when called shortly after start() resolves
      // (before the scheduled React re-render has updated the closed-over state).
      const activeInspection = inspectionRef.current
      if (!activeInspection) throw new Error('Inspection not found')
      const textOnlyDamages = damages
        .filter(d => !d.photoBlob)
        .map(d => ({ location: d.location, description: d.description, photo_url: null, photo_drive_id: null }))
      for (const d of [...textOnlyDamages, ...photoResults]) {
        await api.post(`/api/inspect/${activeInspection.id}/damage`, {
          location: d.location || null, description: d.description || null,
          photo_url: d.photo_url || null, photo_drive_id: d.photo_drive_id || null,
        })
      }
      mark('done'); si++

      // Step 4 — complete
      mark('active')
      await complete(photoResults.length)
      mark('done')
      session.markUploadComplete()
      try { sessionStorage.removeItem('ds_upload_pending') } catch {}
      setPhase('done')

    } catch (err) {
      mark('error')
      const reason = err.response?.data?.detail || err.message || 'Something went wrong'
      setUploadError(reason)
      session.markUploadFailed(reason)
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
          <p className="text-gray-400 font-semibold">{t('Starting inspection…', 'Iniciando inspección…')}</p>
        </div>
      </FullScreenShell>
    )
  }

  if (phase === 'error' || (!starting && error)) {
    return (
      <FullScreenShell title={typeInfo.label} showBack>
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <AlertCircle className="w-12 h-12 text-red-400" />
          <p className="text-red-400 font-bold text-lg">{t('Could Not Start', 'No se pudo iniciar')}</p>
          <p className="text-gray-500 text-sm">{error || t('Unknown error — go back and try again', 'Error desconocido — vuelva e intente de nuevo')}</p>
          <button onClick={() => navigate(-1)} className="btn-ghost w-auto px-8 mt-2">{t('← Go Back', '← Volver')}</button>
        </div>
      </FullScreenShell>
    )
  }

  if (phase === 'done') {
    return (
      <FullScreenShell title={t('Inspection Complete', 'Inspección Completa')}>
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 text-center">
          <div className="w-24 h-24 rounded-full bg-green-900/40 border-2 border-green-600 flex items-center justify-center">
            <CheckCircle className="w-14 h-14 text-green-400" />
          </div>
          <div>
            <p className="text-2xl font-extrabold text-brand-white">{t('All Done!', '¡Todo listo!')}</p>
            <p className="text-gray-500 text-sm mt-1">
              {type === 'condition' && conditionVin
                ? t(`Condition video recorded — VIN ${conditionVin}`, `Video de condición grabado — VIN ${conditionVin}`)
                : t(`${inspection?.inspection_type} inspection saved`, 'Inspección guardada')}
            </p>
          </div>
          <div className="flex flex-col gap-2 w-full max-w-xs">
            <div className="flex items-center gap-3 bg-green-900/40 border border-green-700 rounded-xl px-4 py-2.5">
              <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />
              <span className="text-green-300 text-sm font-semibold">{t('Inspection Saved', 'Inspección Guardada')}</span>
            </div>
            {type !== 'condition' && inspection?.video_count === 0 ? (
              <div className="flex items-center gap-3 bg-yellow-900/40 border border-yellow-700 rounded-xl px-4 py-2.5">
                <AlertCircle className="w-5 h-5 text-yellow-400 shrink-0" />
                <span className="text-yellow-300 text-sm font-semibold">{t('Video may not have uploaded — check Drive', 'El video puede no haberse subido — verifique Drive')}</span>
              </div>
            ) : (
              <div className="flex items-center gap-3 bg-green-900/40 border border-green-700 rounded-xl px-4 py-2.5">
                <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />
                <span className="text-green-300 text-sm font-semibold">{t('Media Uploaded', 'Medios Subidos')}</span>
              </div>
            )}
          </div>
          {(inspection?.photo_count > 0 || inspection?.video_count > 0) && (
            <div className="flex items-center gap-4 text-sm font-semibold text-gray-400">
              {inspection.photo_count > 0 && <span>📷 {inspection.photo_count} photo{inspection.photo_count !== 1 ? 's' : ''}</span>}
              {inspection.video_count > 0 && <span>🎥 {inspection.video_count} video{inspection.video_count !== 1 ? 's' : ''}</span>}
              <span className="text-gray-600">{t('saved to Drive', 'guardado en Drive')}</span>
            </div>
          )}
          {inspection?.drive_folder_url && (
            <a href={inspection.drive_folder_url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-bold bg-green-900/30 border border-green-700 text-green-400 px-4 py-2.5 rounded-xl">
              <ExternalLink className="w-4 h-4" /> {t('Open Drive Folder', 'Abrir Carpeta de Drive')}
            </a>
          )}
          {damagesRef.current.length > 0 && (
            <p className="text-yellow-400 text-sm font-semibold">
              {t(
                `⚠ ${damagesRef.current.length} damage item${damagesRef.current.length !== 1 ? 's' : ''} logged`,
                `⚠ ${damagesRef.current.length} daño${damagesRef.current.length !== 1 ? 's' : ''} registrado${damagesRef.current.length !== 1 ? 's' : ''}`
              )}
            </p>
          )}
          <button onClick={() => navigate('/')} className="btn-primary mt-2">
            <Home className="w-5 h-5" /> {t('Back to Home', 'Regresar al Inicio')}
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

  const phaseTitle = {
    recording: typeInfo.label,
    damage:    t('Log Damage', 'Registrar Daños'),
    uploading: t('Saving…', 'Guardando…'),
  }[phase] || typeInfo.label
  const isCondition = type === 'condition'
  const ORDERED = isCondition ? ['recording', 'uploading'] : ['recording', 'damage', 'uploading']
  const STEP_LABEL = isCondition
    ? { recording: 'Step 1/2', uploading: 'Step 2/2' }
    : { recording: 'Step 1/3', damage: 'Step 2/3', uploading: 'Step 3/3' }

  return (
    <div className="min-h-screen bg-brand-dark flex flex-col">
      <ConnectionStatusBanner uploading={uploading} />
      <PageHeader title={phaseTitle} subtitle={phase === 'recording' ? subtitle : undefined} showBack={phase === 'recording'} />
      {/* Tighter padding + smaller gap in recording phase so VideoRecorder fills the
          full viewport height in both portrait and landscape without scrolling. */}
      <main className={phase === 'recording'
        ? 'flex-1 flex flex-col px-3 pt-2 pb-3 gap-2'
        : 'flex-1 flex flex-col px-5 pt-4 pb-8 gap-5'}>
        <div className="flex items-center gap-2 shrink-0">
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
            {STEP_LABEL[phase]}
          </span>
        </div>
        {phase === 'recording' && (
          <VideoRecorder
            onComplete={handleVideoComplete}
            onRecordingStarted={session.markRecordingStarted}
            onRecordingStopped={(secs) => session.markRecordingStopped(secs, type)}
            overlayContext={{
              vehicleLabel: vehicle?.loaner_number ?? null,
              type: type ?? '',
              porter: (() => {
                try { return JSON.parse(sessionStorage.getItem('currentUser') || 'null')?.name } catch { return null }
              })(),
            }}
          />
        )}
        {phase === 'damage' && (
          <DamageLogger capturedPhotos={photoBlobsRef.current} onComplete={handleDamageComplete} onSkip={handleSkipDamage} />
        )}
        {phase === 'uploading' && (
          <UploadProgress steps={uploadSteps} currentPct={uploadPct} errorMsg={uploadError} />
        )}
        {phase === 'uploading' && finalizeFailure && (
          <div className="flex flex-col gap-3 bg-brand-mid border border-brand-accent rounded-2xl p-5">
            <p className="text-green-400 font-semibold text-sm text-center">
              ✓ {t('Video uploaded successfully.', 'Video subido correctamente.')}
            </p>
            <p className="text-gray-400 text-sm text-center">
              {t(
                "Couldn't save the inspection record. Please try again.",
                'No se pudo guardar el registro. Por favor intente de nuevo.',
              )}
            </p>
            <button
              onClick={handleFinalizeRetry}
              disabled={finalizeRetrying}
              className="btn-primary disabled:opacity-50"
            >
              {finalizeRetrying && <Loader className="w-4 h-4 animate-spin" />}
              {t('Try Again', 'Intentar de nuevo')}
            </button>
            <button onClick={() => navigate('/')} className="btn-ghost">
              <Home className="w-4 h-4" /> {t('Go Home', 'Ir al Inicio')}
            </button>
          </div>
        )}
        {phase === 'uploading' && uploadError && (
          <button onClick={() => navigate('/')} className="btn-ghost w-auto px-8 mx-auto">
            <Home className="w-5 h-5" /> {t('Go Home', 'Ir al Inicio')}
          </button>
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
