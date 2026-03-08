/**
 * DealerSuite — CSV Import Modal
 * Manager drags/drops or picks a TSD Dealer CSV file.
 * Shows a live import summary after upload.
 */

import { useState, useRef, useCallback } from 'react'
import { Upload, FileText, CheckCircle, XCircle, AlertTriangle, X, RefreshCw } from 'lucide-react'
import api from '../../utils/api'

function ImportSummary({ summary, filename }) {
  const { created, updated, skipped, errors, total } = summary

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <CheckCircle className="w-8 h-8 text-brand-green shrink-0" />
        <div>
          <p className="text-brand-white font-bold text-lg">Import Complete</p>
          <p className="text-gray-400 text-sm">{filename}</p>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-green-900/30 border border-green-800 rounded-xl p-4 text-center">
          <p className="text-3xl font-extrabold text-green-400">{created}</p>
          <p className="text-green-500 text-sm font-semibold mt-1">Added</p>
        </div>
        <div className="bg-brand-blue/10 border border-brand-blue/30 rounded-xl p-4 text-center">
          <p className="text-3xl font-extrabold text-brand-blue">{updated}</p>
          <p className="text-blue-400 text-sm font-semibold mt-1">Updated</p>
        </div>
        <div className="bg-brand-accent/50 border border-brand-accent rounded-xl p-4 text-center">
          <p className="text-3xl font-extrabold text-gray-400">{skipped}</p>
          <p className="text-gray-500 text-sm font-semibold mt-1">Skipped (Retired)</p>
        </div>
        <div className={`border rounded-xl p-4 text-center
          ${errors.length > 0
            ? 'bg-red-900/30 border-red-800'
            : 'bg-brand-accent/50 border-brand-accent'
          }`}
        >
          <p className={`text-3xl font-extrabold ${errors.length > 0 ? 'text-red-400' : 'text-gray-400'}`}>
            {errors.length}
          </p>
          <p className={`text-sm font-semibold mt-1 ${errors.length > 0 ? 'text-red-500' : 'text-gray-500'}`}>
            Errors
          </p>
        </div>
      </div>

      <p className="text-gray-500 text-xs text-center">{total} rows processed in total</p>

      {/* Error details */}
      {errors.length > 0 && (
        <div className="bg-red-900/20 border border-red-800 rounded-xl p-4">
          <p className="text-red-400 text-sm font-bold mb-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Row errors
          </p>
          <div className="flex flex-col gap-2 max-h-36 overflow-y-auto">
            {errors.map((e, i) => (
              <div key={i} className="text-xs text-red-300">
                <span className="font-mono text-red-500">Row {e.row}{e.vin ? ` (${e.vin})` : ''}:</span>
                {' '}{e.error}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function CSVImportModal({ onClose, onImportComplete }) {
  const fileRef    = useRef(null)
  const [phase,    setPhase]    = useState('idle')   // idle | uploading | done | error
  const [dragOver, setDragOver] = useState(false)
  const [file,     setFile]     = useState(null)
  const [result,   setResult]   = useState(null)
  const [errMsg,   setErrMsg]   = useState(null)

  // ── File selection ──────────────────────────────────────────────────────
  function handleFileSelect(f) {
    if (!f) return
    if (!f.name.toLowerCase().endsWith('.csv')) {
      setErrMsg('Please select a .csv file exported from TSD Dealer')
      return
    }
    setFile(f)
    setErrMsg(null)
    setPhase('idle')
    setResult(null)
  }

  const onInputChange = (e) => handleFileSelect(e.target.files?.[0])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    handleFileSelect(e.dataTransfer.files?.[0])
  }, [])

  // ── Upload ──────────────────────────────────────────────────────────────
  async function handleUpload() {
    if (!file) return
    setPhase('uploading')
    setErrMsg(null)

    const form = new FormData()
    form.append('file', file)

    try {
      const { data } = await api.post('/api/fleet/import', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setResult(data)
      setPhase('done')
      onImportComplete?.()   // refresh parent fleet list
    } catch (err) {
      const msg = err.response?.data?.detail || 'Import failed. Please try again.'
      setErrMsg(msg)
      setPhase('error')
    }
  }

  function handleReset() {
    setFile(null)
    setResult(null)
    setErrMsg(null)
    setPhase('idle')
  }

  return (
    /* Backdrop */
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4">
      {/* Panel */}
      <div className="w-full max-w-md bg-brand-mid border border-brand-accent rounded-3xl
                      max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-brand-accent">
          <div>
            <h2 className="text-xl font-extrabold text-brand-white">Import Fleet CSV</h2>
            <p className="text-gray-500 text-xs mt-0.5">TSD Dealer export format</p>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 bg-brand-accent rounded-xl flex items-center justify-center"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-5">

          {/* ── Done state — show results ─────────────────────────────── */}
          {phase === 'done' && result && (
            <>
              <ImportSummary summary={result.summary} filename={result.filename} />
              <div className="flex gap-3">
                <button onClick={handleReset} className="btn-ghost flex-1">
                  <RefreshCw className="w-5 h-5" /> Import Another
                </button>
                <button onClick={onClose} className="btn-success flex-1">
                  <CheckCircle className="w-5 h-5" /> Done
                </button>
              </div>
            </>
          )}

          {/* ── Upload state ──────────────────────────────────────────── */}
          {phase !== 'done' && (
            <>
              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center
                            gap-4 cursor-pointer transition-colors select-none
                            ${dragOver
                              ? 'border-brand-blue bg-brand-blue/10'
                              : file
                                ? 'border-brand-green bg-brand-green/5'
                                : 'border-brand-accent hover:border-brand-blue/50'
                            }`}
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={onInputChange}
                />

                {file ? (
                  <>
                    <FileText className="w-12 h-12 text-brand-green" />
                    <div className="text-center">
                      <p className="text-brand-white font-bold">{file.name}</p>
                      <p className="text-gray-400 text-sm mt-1">
                        {(file.size / 1024).toFixed(1)} KB · Ready to import
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <Upload className="w-12 h-12 text-gray-500" strokeWidth={1.5} />
                    <div className="text-center">
                      <p className="text-brand-white font-semibold">Drop CSV here</p>
                      <p className="text-gray-500 text-sm mt-1">or tap to choose file</p>
                    </div>
                  </>
                )}
              </div>

              {/* Expected format hint */}
              <div className="bg-brand-dark rounded-xl p-4 border border-brand-accent">
                <p className="text-xs text-gray-500 font-semibold uppercase tracking-widest mb-2">
                  Expected columns
                </p>
                <p className="text-xs font-mono text-gray-400 leading-relaxed">
                  Loaner_Number, VIN, Year, Make, Model,
                  Plate, Mileage, Status, Vehicle_Type
                </p>
                <p className="text-xs text-gray-600 mt-2">
                  Retired vehicles are automatically skipped
                </p>
              </div>

              {/* Error */}
              {errMsg && (
                <div className="bg-red-900/50 border border-red-700 rounded-xl px-4 py-3 flex items-start gap-3">
                  <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-red-300 text-sm">{errMsg}</p>
                </div>
              )}

              {/* Upload button */}
              <button
                onClick={handleUpload}
                disabled={!file || phase === 'uploading'}
                className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {phase === 'uploading' ? (
                  <>
                    <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Importing…
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5" />
                    Import Fleet
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
