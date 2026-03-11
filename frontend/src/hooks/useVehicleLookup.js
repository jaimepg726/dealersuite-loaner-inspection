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

  const lookup = useCallback(async (vin) => {
    setLoading(true)
    setError(null)
    setVehicle(null)

    try {
      const { data } = await api.get(`/api/vehicles/vin/${encodeURIComponent(vin)}`)
      setVehicle(data)
      return data
    } catch (err) {
      const msg =
        err.response?.data?.detail || 'Could not look up vehicle. Check your connection.'
      setError(msg)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const lookupByLoaner = useCallback(async (loanerNumber) => {
    setLoading(true)
    setError(null)
    setVehicle(null)

    try {
      const { data } = await api.get(`/api/vehicles/loaner/${encodeURIComponent(loanerNumber)}`)
      setVehicle(data)
      return data
    } catch (err) {
      const msg =
        err.response?.data?.detail || 'Could not look up loaner. Check your connection.'
      setError(msg)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    setVehicle(null)
    setError(null)
  }, [])

  return { vehicle, loading, error, lookup, lookupByLoaner, reset }
}
