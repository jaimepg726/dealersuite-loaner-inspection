/**
 * DealerSuite — Staff Training / Instructions Page
 *
 * Static bilingual (English / Spanish) step-by-step guide.
 * Reachable from Settings → Staff Training Guide.
 *
 * Structure:
 *   Language toggle (EN / ES) at top
 *   Three workflow sections:
 *     1. Checkout Inspection
 *     2. Check-In Inspection
 *     3. Customer Vehicle Condition Video
 *
 * Each step:
 *   - Numbered
 *   - Bold title
 *   - Short description (1-2 lines)
 *   - Image placeholder slot (dashed border — drop <img> in later)
 *
 * To add a screenshot: replace the placeholder div with:
 *   <img src="/images/step-1.jpg" alt="..." className="w-full rounded-xl" />
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, LogOut, LogIn, Video } from 'lucide-react'

// ── Screenshot assets ─────────────────────────────────────────────────────────
// When screenshots are ready, place them in frontend/public/screenshots/ and
// add a `screenshot` field to the relevant step objects below.
// Expected filenames:
//   home-new-inspection.jpg    — PorterHome screen (Checkout step 2, Checkin step 2, Condition step 1)
//   loaner-lookup.jpg          — ScanVINPage loaner number entry (Checkout step 3, Checkin step 3)
//   type-select-checkout.jpg   — SelectInspectionTypePage, Checkout highlighted (Checkout step 4)
//   type-select-checkin.jpg    — SelectInspectionTypePage, Check-In highlighted (Checkin step 4)
//   walkround-recording.jpg    — InspectPage recording screen (Checkout step 5, Checkin step 5, Condition step 4)
//   damage-log.jpg             — Damage reporting screen (Checkout step 6, Checkin step 6)
//   upload-done.jpg            — "All Done!" completion screen (Checkout step 7, Checkin step 7, Condition step 5)
//   vin-scan.jpg               — ScanVINPage VIN entry mode (Condition step 2)
//   condition-not-found.jpg    — Teal "Continue as Condition Video" card (Condition step 3)
//   key-tag.jpg                — Physical key tag with loaner number (Checkout step 1, Checkin step 1)
//
// Usage: add screenshot: '/screenshots/filename.jpg' to a step object.

// ── Content ──────────────────────────────────────────────────────────────────

const CONTENT = {
  en: {
    pageTitle:   'Staff Training Guide',
    pageSubtitle: 'How to use DealerSuite Loaner Inspection',
    sections: [
      {
        key:   'checkout',
        icon:  LogOut,
        color: 'text-brand-blue',
        bg:    'bg-brand-blue/10',
        title: 'Checkout Inspection',
        sub:   'When a customer is taking a loaner vehicle',
        steps: [
          {
            title: 'Scan the key before going outside',
            desc:  'Find the loaner number printed on the key tag or dashboard sticker. You will need this in the next step.',
          },
          {
            title: 'Tap "New Inspection" on the home screen',
            desc:  'This opens the vehicle identification screen.',
          },
          {
            title: 'Enter the loaner number',
            desc:  'Type the loaner number in the top field and tap "Look Up Loaner." The vehicle details will appear automatically.',
          },
          {
            title: 'Choose "Checkout"',
            desc:  'Tap the blue Checkout button. The camera will open immediately.',
          },
          {
            title: 'Walk around the vehicle',
            desc:  'Follow the 9 guided steps on screen. Each step shows where to point the camera. Hold steady until the timer finishes before moving to the next area.',
          },
          {
            title: 'Log any existing damage (optional)',
            desc:  'If you see pre-existing damage, add a description and take a photo. Tap "No Damage" or "Skip" if the vehicle is clean.',
          },
          {
            title: 'Wait for the upload to finish',
            desc:  'Keep the app open until you see the green "All Done!" screen. The video is saved to Google Drive automatically.',
          },
        ],
      },
      {
        key:   'checkin',
        icon:  LogIn,
        color: 'text-green-400',
        bg:    'bg-green-500/10',
        title: 'Check-In Inspection',
        sub:   'When a customer is returning a loaner vehicle',
        steps: [
          {
            title: 'Scan the key before going outside',
            desc:  'Find the loaner number on the key tag or dashboard sticker.',
          },
          {
            title: 'Tap "New Inspection" on the home screen',
            desc:  'This opens the vehicle identification screen.',
          },
          {
            title: 'Enter the loaner number',
            desc:  'Type the loaner number and tap "Look Up Loaner."',
          },
          {
            title: 'Choose "Check-In"',
            desc:  'Tap the green Check-In button. The camera will open immediately.',
          },
          {
            title: 'Walk around the vehicle',
            desc:  'Follow the 9 guided steps. Pay close attention to any new damage that was not on the checkout video.',
          },
          {
            title: 'Log any new damage',
            desc:  'Document any damage found on return. Add a description and photo for each item. Tap "No Damage" if the vehicle is clean.',
          },
          {
            title: 'Wait for the upload to finish',
            desc:  'Keep the app open until you see "All Done!" The check-in video is saved to Drive alongside the checkout video.',
          },
        ],
      },
      {
        key:   'condition',
        icon:  Video,
        color: 'text-teal-400',
        bg:    'bg-teal-500/10',
        title: 'Customer Vehicle Condition Video',
        sub:   'For non-fleet vehicles — document condition before service',
        steps: [
          {
            title: 'Tap "New Inspection" on the home screen',
            desc:  'This opens the vehicle identification screen.',
          },
          {
            title: 'Scroll down to the VIN section',
            desc:  'Use Barcode scan, Camera (OCR), or Manual entry to enter the full 17-character VIN from the windshield or door jamb.',
          },
          {
            title: 'Vehicle not found? Tap "Continue as Condition Video"',
            desc:  'If the VIN is not in the loaner fleet, a teal card will appear. This is normal for customer vehicles. Tap the button to continue.',
          },
          {
            title: 'Walk around the vehicle',
            desc:  'Follow the 9 guided steps. Cover every panel, wheel, and bumper. The video uploads to a dedicated "customer-condition" folder in Drive.',
          },
          {
            title: 'Wait for the upload to finish',
            desc:  'Keep the app open until you see "All Done!" The video is saved automatically. No damage logging is required for condition videos.',
          },
        ],
      },
    ],
  },

  es: {
    pageTitle:   'Guía de Capacitación',
    pageSubtitle: 'Cómo usar DealerSuite Loaner Inspection',
    sections: [
      {
        key:   'checkout',
        icon:  LogOut,
        color: 'text-brand-blue',
        bg:    'bg-brand-blue/10',
        title: 'Inspección de Salida (Checkout)',
        sub:   'Cuando un cliente se lleva un vehículo de préstamo',
        steps: [
          {
            title: 'Escanea la llave antes de salir',
            desc:  'Busca el número de loaner impreso en la llave o en la etiqueta del tablero. Lo necesitarás en el siguiente paso.',
          },
          {
            title: 'Toca "Nueva Inspección" en la pantalla de inicio',
            desc:  'Esto abre la pantalla de identificación del vehículo.',
          },
          {
            title: 'Ingresa el número de loaner',
            desc:  'Escribe el número en el campo superior y toca "Buscar Loaner." Los datos del vehículo aparecerán automáticamente.',
          },
          {
            title: 'Selecciona "Checkout"',
            desc:  'Toca el botón azul de Checkout. La cámara se abrirá de inmediato.',
          },
          {
            title: 'Camina alrededor del vehículo',
            desc:  'Sigue los 9 pasos guiados en pantalla. Cada paso indica hacia dónde apuntar la cámara. Mantén firme la cámara hasta que termine el temporizador antes de pasar al siguiente punto.',
          },
          {
            title: 'Registra daños existentes (opcional)',
            desc:  'Si ves algún daño previo, agrega una descripción y toma una foto. Toca "Sin Daños" o "Omitir" si el vehículo está limpio.',
          },
          {
            title: 'Espera a que la carga termine',
            desc:  'Mantén la app abierta hasta ver la pantalla verde "¡Listo!" El video se guarda automáticamente en Google Drive.',
          },
        ],
      },
      {
        key:   'checkin',
        icon:  LogIn,
        color: 'text-green-400',
        bg:    'bg-green-500/10',
        title: 'Inspección de Regreso (Check-In)',
        sub:   'Cuando un cliente devuelve un vehículo de préstamo',
        steps: [
          {
            title: 'Escanea la llave antes de salir',
            desc:  'Busca el número de loaner en la llave o en la etiqueta del tablero.',
          },
          {
            title: 'Toca "Nueva Inspección" en la pantalla de inicio',
            desc:  'Esto abre la pantalla de identificación del vehículo.',
          },
          {
            title: 'Ingresa el número de loaner',
            desc:  'Escribe el número y toca "Buscar Loaner."',
          },
          {
            title: 'Selecciona "Check-In"',
            desc:  'Toca el botón verde de Check-In. La cámara se abrirá de inmediato.',
          },
          {
            title: 'Camina alrededor del vehículo',
            desc:  'Sigue los 9 pasos guiados. Presta especial atención a cualquier daño nuevo que no estaba en el video de salida.',
          },
          {
            title: 'Registra cualquier daño nuevo',
            desc:  'Documenta cualquier daño encontrado al regreso. Agrega descripción y foto para cada uno. Toca "Sin Daños" si el vehículo está en buen estado.',
          },
          {
            title: 'Espera a que la carga termine',
            desc:  'Mantén la app abierta hasta ver "¡Listo!" El video de regreso se guarda junto al video de salida en Drive.',
          },
        ],
      },
      {
        key:   'condition',
        icon:  Video,
        color: 'text-teal-400',
        bg:    'bg-teal-500/10',
        title: 'Video de Condición del Vehículo',
        sub:   'Para vehículos de clientes — documenta la condición antes del servicio',
        steps: [
          {
            title: 'Toca "Nueva Inspección" en la pantalla de inicio',
            desc:  'Esto abre la pantalla de identificación del vehículo.',
          },
          {
            title: 'Desplázate hacia la sección de VIN',
            desc:  'Usa el escáner de código de barras, la cámara (OCR) o la entrada manual para ingresar el VIN completo de 17 caracteres del parabrisas o del marco de la puerta.',
          },
          {
            title: '¿Vehículo no encontrado? Toca "Continuar como Video de Condición"',
            desc:  'Si el VIN no está en la flota de loaners, aparecerá una tarjeta de color verde azulado. Esto es normal para vehículos de clientes. Toca el botón para continuar.',
          },
          {
            title: 'Camina alrededor del vehículo',
            desc:  'Sigue los 9 pasos guiados. Cubre cada panel, llanta y parachoques. El video se sube automáticamente a una carpeta especial en Drive.',
          },
          {
            title: 'Espera a que la carga termine',
            desc:  'Mantén la app abierta hasta ver "¡Listo!" El video se guarda automáticamente. No es necesario registrar daños en los videos de condición.',
          },
        ],
      },
    ],
  },
}

// ── Step card ─────────────────────────────────────────────────────────────────
function StepCard({ number, title, desc, screenshot }) {
  return (
    <div className="flex gap-3">
      {/* Step number */}
      <div className="shrink-0 w-7 h-7 rounded-full bg-brand-accent border border-brand-blue/40
                      flex items-center justify-center mt-0.5">
        <span className="text-xs font-extrabold text-brand-blue">{number}</span>
      </div>

      <div className="flex-1 pb-4">
        {/* Title */}
        <p className="text-brand-white font-bold text-sm leading-snug">{title}</p>
        {/* Description */}
        <p className="text-gray-400 text-xs mt-1 leading-relaxed">{desc}</p>

        {/* Screenshot or placeholder */}
        {screenshot
          ? <img src={screenshot} alt={title} className="mt-3 w-full rounded-xl" />
          : (
            <div className="mt-3 w-full rounded-xl border border-dashed border-brand-accent/60
                            flex items-center justify-center py-5 bg-brand-mid/40">
              <span className="text-gray-600 text-xs font-semibold tracking-wider">[ Photo ]</span>
            </div>
          )
        }
      </div>
    </div>
  )
}

// ── Section card ──────────────────────────────────────────────────────────────
function SectionCard({ section }) {
  const { icon: Icon, color, bg, title, sub, steps } = section
  return (
    <div className="bg-brand-mid rounded-2xl border border-brand-accent overflow-hidden">
      {/* Section header */}
      <div className={`flex items-center gap-3 px-5 py-4 border-b border-brand-accent`}>
        <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
        <div>
          <p className={`font-extrabold text-base ${color}`}>{title}</p>
          <p className="text-gray-500 text-xs">{sub}</p>
        </div>
      </div>

      {/* Steps */}
      <div className="px-5 pt-4">
        {steps.map((step, i) => (
          <StepCard
            key={i}
            number={i + 1}
            title={step.title}
            desc={step.desc}
            screenshot={step.screenshot}
          />
        ))}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function InstructionsPage() {
  const navigate  = useNavigate()
  const [lang, setLang] = useState('en')
  const content = CONTENT[lang]

  return (
    <div className="flex flex-col pb-12">

      {/* Page header */}
      <div className="px-5 pt-5 pb-4 flex items-center gap-3 border-b border-brand-accent">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 bg-brand-mid border border-brand-accent rounded-xl
                     flex items-center justify-center active:scale-95 transition-transform"
          aria-label="Back"
        >
          <ArrowLeft className="w-4 h-4 text-gray-400" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-extrabold text-brand-white leading-tight">
            {content.pageTitle}
          </h2>
          <p className="text-gray-500 text-xs">{content.pageSubtitle}</p>
        </div>

        {/* Language toggle */}
        <div className="flex gap-1 shrink-0 bg-brand-mid border border-brand-accent rounded-xl p-1">
          {['en', 'es'].map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-colors ${
                lang === l
                  ? 'bg-brand-blue text-white'
                  : 'text-gray-500'
              }`}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Sections */}
      <div className="px-5 pt-5 flex flex-col gap-5">
        {content.sections.map((section) => (
          <SectionCard key={section.key} section={section} />
        ))}
      </div>

    </div>
  )
}
