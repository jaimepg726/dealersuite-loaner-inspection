/**
 * DealerSuite — porter language helper
 *
 * Reads the selected porter's language from sessionStorage (set by SelectUserPage).
 * Defaults safely to English if not set or on any error.
 *
 * Usage:
 *   import { t } from '../utils/lang'
 *   t('Start Recording', 'Iniciar Grabación')
 */

export function getLang() {
  try {
    const cu = JSON.parse(sessionStorage.getItem('currentUser') || 'null')
    return cu?.lang || 'en'
  } catch { return 'en' }
}

/** Return the Spanish string when the current porter's language is Spanish, else English. */
export function t(en, es) {
  return getLang() === 'es' ? es : en
}
