/**
 * DealerSuite — UploadProgress
 *
 * Displays a sequential upload status screen while the inspection
 * video, damage photos, and database records are saved.
 *
 * Props:
 *   steps: [{ label: string, status: 'pending'|'active'|'done'|'error' }]
 *   currentPct: number   — upload percentage for the active step (0-100)
 *   errorMsg:   string?  — shown if any step errored
 */

import { CheckCircle, Loader, AlertCircle, Circle, Upload } from 'lucide-react'
import { t } from '../../utils/lang'

function StepRow({ step }) {
  const icon = {
    done:    <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />,
    active:  <Loader      className="w-5 h-5 text-brand-blue animate-spin shrink-0" />,
    error:   <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />,
    pending: <Circle      className="w-5 h-5 text-gray-600 shrink-0" />,
  }[step.status]

  const labelColor = {
    done:    'text-green-400',
    active:  'text-brand-white font-bold',
    error:   'text-red-400',
    pending: 'text-gray-600',
  }[step.status]

  return (
    <div className="flex items-center gap-3 py-2">
      {icon}
      <span className={`text-sm ${labelColor}`}>{step.label}</span>
    </div>
  )
}

export default function UploadProgress({ steps = [], currentPct = 0, errorMsg = null }) {
  const doneCount   = steps.filter(s => s.status === 'done').length
  const totalCount  = steps.length
  const overallPct  = totalCount > 0
    ? Math.round(((doneCount / totalCount) * 100 + (currentPct / totalCount)) * 10) / 10
    : 0

  const isUploading = !errorMsg && doneCount < totalCount

  return (
    <div className="card flex flex-col gap-5">
      {/* "Do not close" warning — shown while upload is active */}
      {isUploading && (
        <div className="flex items-center gap-3 bg-yellow-900/40 border border-yellow-600
                        rounded-xl px-4 py-3">
          <AlertCircle className="w-5 h-5 text-yellow-400 shrink-0" />
          <div>
            <p className="text-yellow-300 font-extrabold text-sm leading-tight">
              {t('Upload in progress — do not close the app', 'Subiendo — no cierre la aplicación')}
            </p>
            <p className="text-yellow-500 text-xs mt-0.5">
              {t('Closing now may lose your inspection', 'Cerrar ahora puede perder su inspección')}
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 bg-brand-blue/20 rounded-2xl flex items-center justify-center shrink-0">
          <Upload className="w-6 h-6 text-brand-blue" />
        </div>
        <div>
          <p className="text-brand-white font-extrabold">{t('Saving Inspection', 'Guardando Inspección')}</p>
          <p className="text-gray-500 text-sm">
            {errorMsg
              ? t('Upload failed', 'Error al subir')
              : t(`${doneCount} of ${totalCount} steps complete`, `${doneCount} de ${totalCount} pasos completados`)}
          </p>
        </div>
      </div>

      {/* Overall progress bar — thicker and more prominent during active upload */}
      <div className={`w-full rounded-full overflow-hidden transition-all ${isUploading ? 'h-4 bg-brand-accent' : 'h-2 bg-brand-accent'}`}>
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            errorMsg ? 'bg-red-500' : 'bg-brand-blue'
          }`}
          style={{ width: `${errorMsg ? 100 : overallPct}%` }}
        />
      </div>

      {/* Step list */}
      <div className="flex flex-col divide-y divide-brand-accent">
        {steps.map((step, i) => (
          <StepRow key={i} step={step} />
        ))}
      </div>

      {/* Active step file progress */}
      {!errorMsg && currentPct > 0 && currentPct < 100 && (
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-xs text-gray-500">
            <span>{t('Uploading…', 'Subiendo…')}</span>
            <span>{currentPct}%</span>
          </div>
          <div className="w-full h-1.5 bg-brand-accent rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-green rounded-full transition-all duration-150"
              style={{ width: `${currentPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Error message */}
      {errorMsg && (
        <div className="flex items-start gap-2 bg-red-900/30 border border-red-700
                        rounded-xl p-3 text-sm text-red-400">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}
    </div>
  )
}
