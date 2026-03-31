/**
 * DealerSuite — Vehicle Lookup Hook
 * Calls GET /api/vehicles/vin/{vin} after a successful VIN scan.
 * Returns the vehicle record or a clear error message for the porter.
 */

import { useState, useCallback } from 'react'
import api from '../utils/api'

export default function useVehicleLookup() {
  const [vehicle,  setVehicle]  = useState(null)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)
  const [notFound, setNotFound] = useState(false)

  const lookup = useCallback(async (vin) => {
    setLoading(true)
    setError(null)
    setVehicle(null)
    setNotFound(false)

    try {
      const { data } = await api.get(`/api/vehicles/vin/${encodeURIComponent(vin)}`)
      setVehicle(data)
      return data
    } catch (err) {
      if (err.response?.status === 404) {
        setNotFound(true)
      } else {
        const raw = err.response?.data?.detail
        const msg = Array.isArray(raw)
          ? raw.map(e => e.msg || String(e)).join('; ')
          : raw || 'Could not look up vehicle. Check your connection.'
        setError(msg)
      }
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const lookupByLoaner = useCallback(async (loanerNumber) => {
    setLoading(true)
    setError(null)
    setVehicle(null)
    setNotFound(false) // reset so the VIN-not-found banner doesn't bleed into loaner lookups

    try {
      const { data } = await api.get(`/api/vehicles/loaner/${encodeURIComponent(loanerNumber)}`)
      setVehicle(data)
      return data
    } catch (err) {
      if (err.response?.status === 404) {
        setNotFound(true)
      } else {
        // Guard: FastAPI 422 detail is a list of objects — stringify to prevent
        // "Objects are not valid as a React child" crash when rendering the message.
        const raw = err.response?.data?.detail
        const msg = Array.isArray(raw)
          ? raw.map(e => e.msg || String(e)).join('; ')
          : raw || 'Could not look up loaner. Check your connection.'
        setError(msg)
      }
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    setVehicle(null)
    setError(null)
    setNotFound(false)
  }, [])

  return { vehicle, loading, error, notFound, lookup, lookupByLoaner, reset }
}
