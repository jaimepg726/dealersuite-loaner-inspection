/**
 * Walkround Step Configuration
 *
 * Controls the guided walkround overlay in VideoRecorder.
 *
 * Each step has:
 *   label    — displayed as the primary step name
 *   hint     — secondary instruction for the porter
 *   duration — seconds the countdown shows for this step
 *              (raise this for real-world testing; lower it for dev/demo)
 *
 * To adjust all step timings quickly for a real-world test run, edit
 * the duration values below.  The total minimum recording time is
 * controlled separately by MIN_RECORD_SECONDS.
 *
 * Dot positions for the top-down car graphic (used in VideoRecorder.jsx):
 *   cx / cy — SVG coordinates in the 56×90 viewBox
 *   These map the step label to a position on the car outline.
 */

export const WALKROUND_STEPS = [
  { label: 'Driver Front Wheel',    hint: 'Get close — show full wheel face',    duration: 9,  cx: 8,  cy: 22 },
  { label: 'Driver Side',           hint: 'Hold level at door handle height',    duration: 9,  cx: 4,  cy: 45 },
  { label: 'Driver Rear Wheel',     hint: 'Get close — show full wheel face',    duration: 7,  cx: 8,  cy: 68 },
  { label: 'Rear Bumper',           hint: 'Full width — stay level',             duration: 7,  cx: 28, cy: 84 },
  { label: 'Passenger Rear Wheel',  hint: 'Get close — show full wheel face',    duration: 7,  cx: 48, cy: 68 },
  { label: 'Passenger Side',        hint: 'Level sweep — front to back',         duration: 9,  cx: 52, cy: 45 },
  { label: 'Passenger Front Wheel', hint: 'Get close — show full wheel face',    duration: 7,  cx: 48, cy: 22 },
  { label: 'Front Bumper',          hint: 'Step back — capture full width',      duration: 7,  cx: 28, cy: 6  },
  { label: 'Windshield & Hood',     hint: 'Step back — get full glass and hood', duration: 9,  cx: 28, cy: 18 },
]

/**
 * Minimum recording duration in seconds before "Stop Recording" unlocks.
 * Increase for real inspections; decrease for testing/demo.
 * Current value: 72s (covers all 9 steps at their full durations = 71s total, plus 1s buffer).
 */
export const MIN_RECORD_SECONDS = 72
