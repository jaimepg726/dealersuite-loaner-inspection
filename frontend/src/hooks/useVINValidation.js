/**
 * DealerSuite — VIN Validation Hook
 * Mirrors the backend validation rules:
 *   • Exactly 17 characters
 *   • Uppercase
 *   • No I, O, or Q
 *   • Alphanumeric only
 */

const INVALID_CHARS = new Set(['I', 'O', 'Q'])
const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/

export function validateVIN(raw) {
  if (!raw || typeof raw !== 'string') {
    return { valid: false, vin: '', error: 'No VIN provided' }
  }

  // Clean: uppercase, strip spaces/dashes
  const vin = raw.toUpperCase().replace(/[\s\-]/g, '')

  if (vin.length !== 17) {
    return {
      valid: false,
      vin,
      error: `VIN must be 17 characters (got ${vin.length})`,
    }
  }

  const badChars = [...vin].filter((c) => INVALID_CHARS.has(c))
  if (badChars.length > 0) {
    return {
      valid: false,
      vin,
      error: `VIN contains invalid characters: ${[...new Set(badChars)].join(', ')}`,
    }
  }

  if (!VIN_REGEX.test(vin)) {
    return {
      valid: false,
      vin,
      error: 'VIN contains invalid characters (letters and numbers only)',
    }
  }

  return { valid: true, vin, error: null }
}

/**
 * Conservative OCR normalization applied before VIN extraction.
 * Only swaps characters that are unambiguously wrong in a VIN:
 *   O → 0  (letter O is banned in VINs; OCR often returns it for zero)
 *   I → 1  (letter I is banned in VINs; OCR often returns it for one)
 * Q, L, S, B are NOT mapped — too ambiguous to substitute blindly.
 */
export function normalizeOCRText(text) {
  if (!text) return ''
  return text.toUpperCase().replace(/O/g, '0').replace(/I/g, '1')
}

/**
 * Tries to extract a valid 17-char VIN from a longer OCR string.
 * Scans for the first 17-char run that passes VIN rules.
 */
export function extractVINFromText(text) {
  if (!text) return null
  const cleaned = text.toUpperCase().replace(/[^A-Z0-9]/g, ' ')
  const tokens  = cleaned.split(/\s+/)

  for (const token of tokens) {
    const { valid, vin } = validateVIN(token)
    if (valid) return vin
  }

  // Also try sliding window over joined text (OCR sometimes drops spaces)
  const joined = cleaned.replace(/\s/g, '')
  for (let i = 0; i <= joined.length - 17; i++) {
    const candidate = joined.slice(i, i + 17)
    const { valid, vin } = validateVIN(candidate)
    if (valid) return vin
  }

  return null
}
