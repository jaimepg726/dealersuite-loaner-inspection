/**
 * DealerSuite — Staff Training Guide
 *
 * Step-by-step porter training with screenshot placeholders.
 * Language toggle: EN / ES (independent of sessionStorage porter lang).
 *
 * Structure:
 *   11 sections (A–K) — each has title, screenshot slot, steps, optional tip/warning
 *   Section F (walkaround) includes 9 sub-step cards, each with its own screenshot slot
 *
 * To add a screenshot: set the `screenshot` field to '/screenshots/filename.jpg'
 * Screenshot slot labels show the expected filename (see [ screenshot: key ] placeholders).
 *
 * Expected screenshot files (place in frontend/public/screenshots/):
 *   Section slots:  select-name, loaner-number, not-found, prepare-vehicle,
 *                   start-recording, walkaround-overview, damage-photos,
 *                   log-damage, no-damage, upload-done, troubleshoot
 *   Walkaround:     walk-driver-front-wheel, walk-driver-side, walk-driver-rear-wheel,
 *                   walk-rear-bumper, walk-pass-rear-wheel, walk-pass-side,
 *                   walk-pass-front-wheel, walk-front-bumper, walk-windshield-hood
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  User,
  Hash,
  AlertCircle,
  Wrench,
  Video,
  Camera,
  Aperture,
  AlertTriangle,
  CheckCircle,
  Upload,
  HelpCircle,
  Pencil,
  Printer,
  ImagePlus,
  Trash2,
  RefreshCw,
} from 'lucide-react'
import api from '../../utils/api'
import { useAuth } from '../../context/AuthContext'

// ── Section metadata (language-independent) ───────────────────────────────────
const SECTIONS_META = [
  { screenshotKey: 'select-name',       icon: User,          iconBg: 'bg-brand-blue/10',   iconColor: 'text-brand-blue'   },
  { screenshotKey: 'loaner-number',     icon: Hash,          iconBg: 'bg-purple-900/30',   iconColor: 'text-purple-400'   },
  { screenshotKey: 'not-found',         icon: AlertCircle,   iconBg: 'bg-teal-900/30',     iconColor: 'text-teal-400'     },
  { screenshotKey: 'prepare-vehicle',   icon: Wrench,        iconBg: 'bg-yellow-900/30',   iconColor: 'text-yellow-400'   },
  { screenshotKey: 'start-recording',   icon: Video,         iconBg: 'bg-brand-blue/10',   iconColor: 'text-brand-blue'   },
  { screenshotKey: 'walkaround',        icon: Camera,        iconBg: 'bg-green-900/30',    iconColor: 'text-green-400'    },
  { screenshotKey: 'damage-photos',     icon: Aperture,      iconBg: 'bg-orange-900/30',   iconColor: 'text-orange-400'   },
  { screenshotKey: 'log-damage',        icon: AlertTriangle, iconBg: 'bg-red-900/30',      iconColor: 'text-red-400'      },
  { screenshotKey: 'no-damage',         icon: CheckCircle,   iconBg: 'bg-green-900/30',    iconColor: 'text-green-400'    },
  { screenshotKey: 'upload-done',       icon: Upload,        iconBg: 'bg-brand-blue/10',   iconColor: 'text-brand-blue'   },
  { screenshotKey: 'troubleshoot',      icon: HelpCircle,    iconBg: 'bg-gray-800',        iconColor: 'text-gray-400'     },
]

// Screenshot keys for the 9 walkaround sub-steps (same in both languages)
const WALKAROUND_SCREENSHOT_KEYS = [
  'walk-driver-front-wheel',
  'walk-driver-side',
  'walk-driver-rear-wheel',
  'walk-rear-bumper',
  'walk-pass-rear-wheel',
  'walk-pass-side',
  'walk-pass-front-wheel',
  'walk-front-bumper',
  'walk-windshield-hood',
]

// ── Content ───────────────────────────────────────────────────────────────────
const CONTENT = {
  en: {
    pageTitle:    'Staff Training Guide',
    pageSubtitle: 'How to use DealerSuite Loaner Inspection',
    tipLabel:     'Tip',
    warningLabel: 'Important',
    walkaroundIntro: 'Follow each step on screen. Hold steady at each position until the timer reaches zero.',
    sections: [
      // A
      {
        title: 'A. Select Your Name',
        screenshot: null,
        steps: [
          'Tap your name from the list on screen',
          'Porters proceed immediately — no PIN required',
          'Advisors and managers must enter their PIN before continuing',
        ],
        tip: 'If your name is not in the list, ask your manager to add it.',
      },
      // B
      {
        title: 'B. Enter Loaner Number',
        screenshot: null,
        steps: [
          'Find the loaner number on the key tag or dashboard sticker',
          'Type it into the large field and tap "Look Up"',
          'Vehicle details appear automatically — verify the make and model',
          'If correct, proceed to the next screen',
        ],
        tip: 'The number is usually 3–4 digits (e.g. 104, 215). It is printed on the physical key tag.',
      },
      // C
      {
        title: 'C. If Vehicle Is Not Found',
        screenshot: null,
        steps: [
          'A teal banner appears: "Vehicle not found in loaner fleet"',
          'This is normal for customer vehicles not yet in the system',
          'Tap "Condition Video" to continue and record the vehicle\'s condition',
          'The recording saves to a dedicated condition folder in Drive',
        ],
        warning: 'Only use Condition Video if you are sure the vehicle is NOT a fleet loaner. If you are unsure, contact your manager before continuing.',
      },
      // D
      {
        title: 'D. Prepare the Vehicle Before Recording',
        screenshot: null,
        steps: [
          'Move the vehicle so you can walk fully around it — at least one car-door width on every side',
          'Wipe the camera lens clean if it looks foggy or smudged',
          'Check that lighting is adequate — avoid strong shadows or direct glare',
          'Position yourself 4–6 feet from the vehicle before starting',
        ],
        tip: 'Rule of thumb: stand one car-door width away from the side you are filming.',
        warning: 'If the vehicle is against a wall or another car, move it first. You must be able to complete a full loop around the vehicle.',
      },
      // E
      {
        title: 'E. Start Walkaround Recording',
        screenshot: null,
        steps: [
          'Tap "Start Recording" — the camera activates immediately',
          'A guided overlay appears showing 9 steps with individual countdown timers',
          'Follow the step currently shown — the dot on the car diagram shows your position',
          'The Stop button is locked until the minimum recording time is reached',
        ],
        warning: 'Do NOT stop recording mid-walk. If you miss a section or the video is unclear, tap Re-record and start from the beginning.',
      },
      // F
      {
        title: 'F. Record the Full Walkaround',
        screenshot: null,
        steps: [
          'Stay 4–6 feet from the vehicle throughout all 9 steps',
          'Walk slowly — no faster than a normal walking pace',
          'Hold camera at door-handle height for side panels; step back for bumpers and hood',
          'Let each step timer reach zero before moving to the next position',
        ],
        warning: 'Missing any section means an incomplete inspection. The video must show every panel, wheel, bumper, and windshield.',
        walkaround: [
          {
            label: 'Driver Front Wheel',
            hint:  'Get close — camera should show the full wheel face',
            tip:   'Angle slightly downward to show tire tread depth',
            screenshot: null,
          },
          {
            label: 'Driver Side',
            hint:  'Hold at door-handle height — sweep slowly from front to back',
            tip:   'Keep your distance consistent — do not drift closer or farther as you walk',
            screenshot: null,
          },
          {
            label: 'Driver Rear Wheel',
            hint:  'Get close — show the full wheel face and surrounding wheel arch',
            tip:   'Check the rear arch for scrapes or damage before moving on',
            screenshot: null,
          },
          {
            label: 'Rear Bumper',
            hint:  'Step back — frame the full bumper width and stay level',
            tip:   'Include the license plate area and any tow hook covers',
            screenshot: null,
          },
          {
            label: 'Passenger Rear Wheel',
            hint:  'Get close — show the full wheel face',
            tip:   'Mirror the driver rear wheel shot — same distance and framing',
            screenshot: null,
          },
          {
            label: 'Passenger Side',
            hint:  'Level sweep from front to back at door-handle height',
            tip:   'Match the driver side: same distance, same height, same pace',
            screenshot: null,
          },
          {
            label: 'Passenger Front Wheel',
            hint:  'Get close — show the full wheel face',
            tip:   'Check the front wheel arch for curb rash or scrapes',
            screenshot: null,
          },
          {
            label: 'Front Bumper',
            hint:  'Step back — capture full bumper width, headlights, and grille',
            tip:   'Include the license plate frame and both fog light areas',
            screenshot: null,
          },
          {
            label: 'Windshield & Hood',
            hint:  'Step back further — capture the full glass surface and hood',
            tip:   'Look for chips, cracks, and dings — these must all be documented',
            screenshot: null,
          },
        ],
      },
      // G
      {
        title: 'G. Capture Damage Photos',
        screenshot: null,
        steps: [
          'During recording, tap the "Photo" button to capture a still of any damage',
          'Photos taken during recording are automatically added to the damage list after',
          'Take one photo per damage item — do not group multiple damages in one shot',
          'Frame the damage clearly so it fills most of the shot',
        ],
        tip: 'One clear, well-framed photo per item is better than several blurry ones.',
      },
      // H
      {
        title: 'H. Log Damage',
        screenshot: null,
        steps: [
          'After recording, the damage logger screen appears',
          'Select the panel location for each item (e.g. Driver Front, Hood, Windshield)',
          'Add a short description of the damage for each item',
          'Every visible damage must be logged as its own separate item',
          'Tap "Submit Damage Reports" when all items are documented',
        ],
        tip: 'Be specific: "small dent on driver door, 6 inches from window" is far better than just "dent."',
        warning: 'Do NOT select "No Damage" unless you are 100% certain the vehicle is clean. Every missed damage item that is later discovered becomes part of the inspection record.',
      },
      // I
      {
        title: 'I. No Damage Found',
        screenshot: null,
        steps: [
          'After recording, if there is absolutely no visible damage, tap "No Damage — Complete"',
          'You can also tap "Skip Damage & Complete" if you thoroughly checked and found nothing',
          'The inspection immediately starts uploading',
        ],
        tip: 'When in doubt, log it. An extra record costs nothing. A missing record can cause disputes.',
        warning: 'Only select "No Damage" after carefully checking every panel, wheel, bumper, and windshield — not just a quick glance.',
      },
      // J
      {
        title: 'J. Upload and Completion',
        screenshot: null,
        steps: [
          'After damage logging, the upload begins automatically',
          'Keep the app open — do NOT switch to another app or lock the screen',
          'Each upload step shows a green checkmark when it completes',
          'The "All Done!" screen confirms the inspection is fully saved',
          'Video and photos are automatically stored in the Google Drive folder',
        ],
        warning: 'Closing the app, switching apps, or locking the screen during upload may interrupt the save. Stay on the upload screen until you see "All Done!"',
      },
      // K
      {
        title: 'K. What To Do If Something Goes Wrong',
        screenshot: null,
        steps: [
          'Camera error: tap "Try Again" — if it keeps failing, close and restart the app',
          'VIN not found: use the Condition Video option or try manual VIN entry',
          'Wrong vehicle: tap back and re-enter the correct loaner number',
          'Upload fails: tap "Go Home" and notify your manager right away',
          'Unexpected error: take a screenshot if possible, then report it to your manager',
        ],
        tip: 'Never skip an inspection. If the app is not working, report it immediately and document the vehicle condition another way.',
      },
    ],
  },

  es: {
    pageTitle:    'Guía de Capacitación',
    pageSubtitle: 'Cómo usar DealerSuite Loaner Inspection',
    tipLabel:     'Consejo',
    warningLabel: 'Importante',
    walkaroundIntro: 'Sigue cada paso en pantalla. Mantén la posición en cada punto hasta que el temporizador llegue a cero.',
    sections: [
      // A
      {
        title: 'A. Seleccionar tu Nombre',
        screenshot: null,
        steps: [
          'Toca tu nombre en la lista de la pantalla',
          'Los porteros pasan directo — no se necesita PIN',
          'Los asesores y gerentes deben ingresar su PIN antes de continuar',
        ],
        tip: 'Si tu nombre no está en la lista, pídele a tu gerente que te agregue.',
      },
      // B
      {
        title: 'B. Ingresar Número de Préstamo',
        screenshot: null,
        steps: [
          'Busca el número de préstamo en la llave o en la etiqueta del tablero',
          'Escríbelo en el campo grande y toca "Buscar vehículo"',
          'Los datos del vehículo aparecen automáticamente — verifica la marca y modelo',
          'Si es correcto, continúa a la siguiente pantalla',
        ],
        tip: 'El número suele tener 3–4 dígitos (ej. 104, 215). Está impreso en la etiqueta física de la llave.',
      },
      // C
      {
        title: 'C. Si el Vehículo No Se Encuentra',
        screenshot: null,
        steps: [
          'Aparecerá una franja verde azulada: "Vehículo no encontrado en la flota"',
          'Esto es normal para vehículos de clientes que no están en el sistema',
          'Toca "Video de Condición" para continuar y grabar la condición del vehículo',
          'La grabación se guarda en una carpeta especial de condición en Drive',
        ],
        warning: 'Solo usa Video de Condición si estás seguro de que NO es un préstamo de la flota. Si tienes dudas, consulta a tu gerente antes de continuar.',
      },
      // D
      {
        title: 'D. Preparar el Vehículo Antes de Grabar',
        screenshot: null,
        steps: [
          'Mueve el vehículo para que puedas rodearlo completamente — necesitas al menos el ancho de una puerta a cada lado',
          'Limpia el lente de la cámara si se ve empañado o sucio',
          'Verifica que haya buena luz — evita sombras fuertes o reflejos directos',
          'Colócate a 1.2–1.8 metros del vehículo antes de comenzar',
        ],
        tip: 'Regla práctica: párate a un ancho de puerta del lateral que estás filmando.',
        warning: 'Si el vehículo está junto a una pared u otro carro, muévelo primero. Debes poder dar una vuelta completa.',
      },
      // E
      {
        title: 'E. Iniciar la Grabación del Recorrido',
        screenshot: null,
        steps: [
          'Toca "Iniciar Grabación" — la cámara se activa de inmediato',
          'Aparece una guía con 9 pasos y temporizadores individuales para cada uno',
          'Sigue el paso que se muestra — el punto en el diagrama del carro indica tu posición',
          'El botón Detener está bloqueado hasta completar el tiempo mínimo de grabación',
        ],
        warning: 'NO detengas la grabación a la mitad. Si te pierdes una sección o el video no se ve bien, toca Volver a grabar y empieza desde el principio.',
      },
      // F
      {
        title: 'F. Grabar el Recorrido Completo',
        screenshot: null,
        steps: [
          'Mantente a 1.2–1.8 metros del vehículo durante los 9 pasos',
          'Camina despacio — no más rápido que un paso normal',
          'Sostén la cámara a la altura de la manija de la puerta para los laterales; retrocede para parachoques y capó',
          'Deja que cada temporizador llegue a cero antes de moverte al siguiente punto',
        ],
        warning: 'Omitir cualquier sección significa una inspección incompleta. El video debe mostrar todos los paneles, llantas, parachoques y el parabrisas.',
        walkaround: [
          {
            label: 'Rueda Delantera Conductor',
            hint:  'Acércate — la cámara debe mostrar la rueda completa',
            tip:   'Inclina ligeramente hacia abajo para mostrar la profundidad de la llanta',
            screenshot: null,
          },
          {
            label: 'Lado Conductor',
            hint:  'A la altura de la manija — pase lento de frente a atrás',
            tip:   'Mantén la distancia constante — no te acerques ni te alejes al caminar',
            screenshot: null,
          },
          {
            label: 'Rueda Trasera Conductor',
            hint:  'Acércate — muestra la rueda completa y el arco del guardabarro',
            tip:   'Revisa el arco trasero por raspaduras o daños antes de continuar',
            screenshot: null,
          },
          {
            label: 'Parachoques Trasero',
            hint:  'Retrocede — encuadra el parachoques completo, mantén nivel',
            tip:   'Incluye la placa y cualquier cubierta de gancho de remolque',
            screenshot: null,
          },
          {
            label: 'Rueda Trasera Pasajero',
            hint:  'Acércate — muestra la rueda completa',
            tip:   'Igual que la rueda trasera del conductor — misma distancia y encuadre',
            screenshot: null,
          },
          {
            label: 'Lado Pasajero',
            hint:  'Pase lento de frente a atrás, a la altura de la manija',
            tip:   'Igual que el lado conductor: misma distancia, misma altura, mismo ritmo',
            screenshot: null,
          },
          {
            label: 'Rueda Delantera Pasajero',
            hint:  'Acércate — muestra la rueda completa',
            tip:   'Revisa el arco delantero por raspaduras de bordes de acera',
            screenshot: null,
          },
          {
            label: 'Parachoques Delantero',
            hint:  'Retrocede — captura el parachoques completo, faros y parrilla',
            tip:   'Incluye el marco de la placa y las áreas de luz antiniebla',
            screenshot: null,
          },
          {
            label: 'Parabrisas y Capó',
            hint:  'Retrocede más — captura el vidrio completo y la superficie del capó',
            tip:   'Busca astillas, grietas y golpes — todos deben documentarse',
            screenshot: null,
          },
        ],
      },
      // G
      {
        title: 'G. Capturar Fotos de Daños',
        screenshot: null,
        steps: [
          'Durante la grabación, toca el botón "Foto" para capturar una imagen del daño',
          'Las fotos tomadas durante la grabación se agregan automáticamente a la lista',
          'Toma una foto separada para cada daño — no juntes varios daños en una sola imagen',
          'El daño debe verse claramente y ocupar la mayor parte del encuadre',
        ],
        tip: 'Una foto clara y bien encuadrada por daño es mejor que varias borrosas.',
      },
      // H
      {
        title: 'H. Registrar Daños',
        screenshot: null,
        steps: [
          'Después de grabar, aparece la pantalla de registro de daños',
          'Selecciona la ubicación del panel para cada item (ej. Cond. Delantero, Capó, Parabrisas)',
          'Agrega una breve descripción del daño para cada item',
          'Cada daño visible debe registrarse como su propio item separado',
          'Toca "Enviar Reportes de Daños" cuando todos los items estén documentados',
        ],
        tip: 'Sé específico: "pequeño golpe en la puerta del conductor, a 15 cm de la ventana" es mucho mejor que solo "golpe."',
        warning: 'NO selecciones "Sin Daños" a menos que estés 100% seguro de que el vehículo está limpio. Todo daño no reportado que se descubra después quedará en el registro de inspección.',
      },
      // I
      {
        title: 'I. Sin Daños',
        screenshot: null,
        steps: [
          'Después de grabar, si no hay absolutamente ningún daño visible, toca "Sin Daños — Completar"',
          'También puedes tocar "Omitir Daños y Completar" si revisaste y no encontraste nada',
          'La inspección comienza a subirse de inmediato',
        ],
        tip: 'Si tienes dudas, regístralo. Un registro extra no cuesta nada. Un registro faltante puede causar disputas.',
        warning: 'Solo selecciona "Sin Daños" después de revisar cada panel, llanta, parachoques y parabrisas cuidadosamente — no solo un vistazo rápido.',
      },
      // J
      {
        title: 'J. Carga y Finalización',
        screenshot: null,
        steps: [
          'Después de registrar daños, la carga comienza automáticamente',
          'Mantén la app abierta — NO cambies de app ni bloquees la pantalla',
          'Cada paso de carga muestra una palomita verde cuando termina',
          'La pantalla "¡Todo listo!" confirma que la inspección se guardó completamente',
          'El video y las fotos se guardan automáticamente en la carpeta de Google Drive',
        ],
        warning: 'Cerrar la app, cambiar a otra app o bloquear la pantalla durante la carga puede interrumpir el guardado. Quédate en la pantalla de carga hasta ver "¡Todo listo!"',
      },
      // K
      {
        title: 'K. Qué Hacer Si Algo Sale Mal',
        screenshot: null,
        steps: [
          'Error de cámara: toca "Intentar de nuevo" — si sigue fallando, cierra y reinicia la app',
          'VIN no encontrado: usa Video de Condición o intenta ingresar el VIN manualmente',
          'Vehículo incorrecto: toca atrás e ingresa el número de préstamo correcto',
          'Error de carga: toca "Ir al Inicio" y avisa a tu gerente de inmediato',
          'Error inesperado: toma una captura de pantalla si es posible, luego repórtalo a tu gerente',
        ],
        tip: 'Nunca omitas una inspección. Si la app no funciona, repórtalo de inmediato y documenta el vehículo de otra manera.',
      },
    ],
  },
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ScreenshotSlot({ screenshotKey, src, label, editMode, onUpload, onDelete, uploading }) {
  const fileRef = useRef(null)
  const hasSrc  = Boolean(src)

  // View mode — show image or nothing (clean for porters)
  if (!editMode) {
    if (!hasSrc) return null
    return <img src={src} alt={label} className="mt-3 w-full rounded-xl" />
  }

  // Manager edit mode — show upload controls
  return (
    <div className="mt-3 print:hidden">
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => onUpload(screenshotKey, e.target.files?.[0])}
      />
      {hasSrc ? (
        <div className="relative rounded-xl overflow-hidden border border-brand-accent">
          <img src={src} alt={label} className="w-full" />
          <div className="absolute top-2 right-2 flex gap-1.5">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="bg-black/70 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg
                         flex items-center gap-1.5 active:scale-95 transition-transform
                         disabled:opacity-50"
            >
              <ImagePlus className="w-3 h-3" /> Replace
            </button>
            <button
              onClick={() => onDelete(screenshotKey)}
              disabled={uploading}
              className="bg-red-700/80 text-white text-xs font-bold px-2 py-1.5 rounded-lg
                         flex items-center active:scale-95 transition-transform
                         disabled:opacity-50"
              aria-label="Remove screenshot"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="w-full rounded-xl border border-dashed border-brand-blue/40
                     flex flex-col items-center justify-center py-5 gap-2
                     bg-brand-blue/5 active:bg-brand-blue/10 transition-colors
                     active:scale-[0.99] disabled:opacity-50"
        >
          {uploading
            ? <RefreshCw className="w-4 h-4 text-brand-blue animate-spin" />
            : <ImagePlus className="w-5 h-5 text-gray-500" />
          }
          <span className="text-xs text-gray-500 font-medium">
            {uploading ? 'Uploading…' : 'Tap to add screenshot'}
          </span>
        </button>
      )}
    </div>
  )
}

function TipBox({ label, text }) {
  return (
    <div className="flex gap-2 bg-green-900/20 border border-green-800/50 rounded-xl px-3 py-2.5">
      <span className="text-green-400 text-xs font-extrabold uppercase tracking-wider shrink-0 mt-0.5">
        {label}:
      </span>
      <p className="text-green-300 text-xs leading-relaxed">{text}</p>
    </div>
  )
}

function WarningBox({ label, text }) {
  return (
    <div className="flex gap-2 bg-yellow-900/20 border border-yellow-700/50 rounded-xl px-3 py-2.5">
      <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
      <div>
        <span className="text-yellow-400 text-xs font-extrabold uppercase tracking-wider">{label}: </span>
        <span className="text-yellow-300 text-xs leading-relaxed">{text}</span>
      </div>
    </div>
  )
}

function WalkaroundCard({ number, step, screenshotKey, src, editMode, onUpload, onDelete, uploading }) {
  return (
    <div className="bg-brand-dark rounded-xl border border-brand-accent/60 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-3 pt-3 pb-2">
        <div className="w-6 h-6 rounded-full bg-brand-blue/20 border border-brand-blue/40
                        flex items-center justify-center shrink-0">
          <span className="text-xs font-extrabold text-brand-blue">{number}</span>
        </div>
        <p className="text-brand-white font-bold text-sm">{step.label}</p>
      </div>

      {/* Screenshot slot */}
      <div className="px-3">
        <ScreenshotSlot
          screenshotKey={screenshotKey}
          src={src}
          label={screenshotKey}
          editMode={editMode}
          onUpload={onUpload}
          onDelete={onDelete}
          uploading={uploading}
        />
      </div>

      {/* Hint + tip */}
      <div className="px-3 pb-3 pt-2 flex flex-col gap-1.5">
        <p className="text-gray-400 text-xs leading-relaxed">{step.hint}</p>
        {step.tip && (
          <p className="text-gray-500 text-xs italic">📐 {step.tip}</p>
        )}
      </div>
    </div>
  )
}

function SectionCard({ meta, section, tipLabel, warningLabel, walkaroundIntro,
                       screenshots, editMode, onUpload, onDelete, uploading }) {
  const { icon: Icon, iconBg, iconColor, screenshotKey } = meta
  const sectionSrc = screenshots[screenshotKey] || section.screenshot

  return (
    <div className="bg-brand-mid rounded-2xl border border-brand-accent overflow-hidden">
      {/* Section header */}
      <div className="flex items-start gap-3 px-4 pt-4 pb-3 border-b border-brand-accent">
        <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center shrink-0 mt-0.5`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`font-extrabold text-base leading-snug ${iconColor}`}>{section.title}</p>
        </div>
      </div>

      <div className="px-4 pt-3 pb-4 flex flex-col gap-3">

        {/* Section screenshot */}
        <ScreenshotSlot
          screenshotKey={screenshotKey}
          src={sectionSrc}
          label={screenshotKey}
          editMode={editMode}
          onUpload={onUpload}
          onDelete={onDelete}
          uploading={uploading.has(screenshotKey)}
        />

        {/* Step bullets */}
        <ul className="flex flex-col gap-1.5">
          {section.steps.map((step, i) => (
            <li key={i} className="flex gap-2 items-start">
              <span className="text-brand-blue text-xs font-extrabold shrink-0 mt-0.5 w-4">
                {i + 1}.
              </span>
              <span className="text-gray-300 text-xs leading-relaxed">{step}</span>
            </li>
          ))}
        </ul>

        {/* Tip */}
        {section.tip && <TipBox label={tipLabel} text={section.tip} />}

        {/* Warning */}
        {section.warning && <WarningBox label={warningLabel} text={section.warning} />}

        {/* Walkaround sub-steps (section F only) */}
        {section.walkaround && (
          <div className="flex flex-col gap-3 mt-1">
            <p className="text-gray-500 text-xs">{walkaroundIntro}</p>
            {section.walkaround.map((step, i) => {
              const wKey = WALKAROUND_SCREENSHOT_KEYS[i]
              return (
                <WalkaroundCard
                  key={i}
                  number={i + 1}
                  step={step}
                  screenshotKey={wKey}
                  src={screenshots[wKey] || step.screenshot}
                  editMode={editMode}
                  onUpload={onUpload}
                  onDelete={onDelete}
                  uploading={uploading.has(wKey)}
                />
              )
            })}
          </div>
        )}

      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function InstructionsPage() {
  const navigate    = useNavigate()
  const { isManager } = useAuth()
  const [lang,        setLang]        = useState('en')
  const [screenshots, setScreenshots] = useState({})
  const [editMode,    setEditMode]    = useState(false)
  const [uploading,   setUploading]   = useState(new Set())
  const content = CONTENT[lang]

  // Load stored screenshots on mount (all authenticated users)
  useEffect(() => {
    api.get('/api/manager/instruction-screenshots')
      .then(({ data }) => setScreenshots(data))
      .catch(() => {})   // optional enhancement — fail silently
  }, [])

  const handleUpload = useCallback(async (key, file) => {
    if (!file) return
    setUploading(prev => new Set([...prev, key]))
    try {
      const form = new FormData()
      form.append('file', file)
      await api.post(`/api/manager/instruction-screenshots/${key}`, form)
      // Compute data URL locally for immediate preview (same bytes as stored)
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload  = () => resolve(reader.result)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      setScreenshots(prev => ({ ...prev, [key]: dataUrl }))
    } catch (err) {
      alert(err.response?.data?.detail || 'Upload failed')
    } finally {
      setUploading(prev => { const s = new Set(prev); s.delete(key); return s })
    }
  }, [])

  const handleDelete = useCallback(async (key) => {
    if (!window.confirm('Remove this screenshot?')) return
    try {
      await api.delete(`/api/manager/instruction-screenshots/${key}`)
      setScreenshots(prev => { const n = { ...prev }; delete n[key]; return n })
    } catch (err) {
      alert(err.response?.data?.detail || 'Could not remove screenshot')
    }
  }, [])

  return (
    <div className="min-h-screen bg-brand-dark flex flex-col pb-12">

      {/* Page header */}
      <div className="sticky top-0 z-10 bg-brand-dark border-b border-brand-accent
                      px-4 pt-5 pb-3 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 bg-brand-mid border border-brand-accent rounded-xl
                     flex items-center justify-center active:scale-95 transition-transform shrink-0
                     print:hidden"
          aria-label="Back"
        >
          <ArrowLeft className="w-4 h-4 text-gray-400" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-extrabold text-brand-white leading-tight truncate">
            {content.pageTitle}
          </h2>
          <p className="text-gray-500 text-xs truncate">{content.pageSubtitle}</p>
        </div>

        {/* Language toggle */}
        <div className="flex gap-1 shrink-0 bg-brand-mid border border-brand-accent rounded-xl p-1
                        print:hidden">
          {['en', 'es'].map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-colors ${
                lang === l ? 'bg-brand-blue text-white' : 'text-gray-500'
              }`}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Print button */}
        <button
          onClick={() => window.print()}
          className="print:hidden w-9 h-9 bg-brand-mid border border-brand-accent rounded-xl
                     flex items-center justify-center active:scale-95 transition-transform shrink-0"
          aria-label="Print guide"
        >
          <Printer className="w-4 h-4 text-gray-400" />
        </button>

        {/* Edit screenshots toggle — manager only */}
        {isManager && (
          <button
            onClick={() => setEditMode(e => !e)}
            className={`print:hidden w-9 h-9 rounded-xl border flex items-center justify-center
                        active:scale-95 transition-transform shrink-0
                        ${editMode
                          ? 'bg-brand-blue border-brand-blue text-white'
                          : 'bg-brand-mid border-brand-accent text-gray-400'
                        }`}
            aria-label={editMode ? 'Done editing screenshots' : 'Edit screenshots'}
            title={editMode ? 'Done editing' : 'Edit screenshots'}
          >
            <Pencil className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Edit mode banner */}
      {editMode && (
        <div className="print:hidden mx-4 mt-4 bg-brand-blue/10 border border-brand-blue/30
                        rounded-2xl px-4 py-3 flex items-center gap-3">
          <Pencil className="w-4 h-4 text-brand-blue shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-brand-blue text-sm font-bold">Screenshot Edit Mode</p>
            <p className="text-blue-400 text-xs mt-0.5">
              Tap the upload area under any step to add or replace a screenshot.
              Tap the pencil icon again when done.
            </p>
          </div>
        </div>
      )}

      {/* Sections */}
      <div className="px-4 pt-4 flex flex-col gap-4">
        {content.sections.map((section, i) => (
          <SectionCard
            key={i}
            meta={SECTIONS_META[i]}
            section={section}
            tipLabel={content.tipLabel}
            warningLabel={content.warningLabel}
            walkaroundIntro={content.walkaroundIntro}
            screenshots={screenshots}
            editMode={editMode}
            onUpload={handleUpload}
            onDelete={handleDelete}
            uploading={uploading}
          />
        ))}
      </div>

    </div>
  )
}
