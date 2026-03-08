/**
 * DealerSuite — Auth Context
 * Stores JWT + user info. Persists to localStorage between page loads.
 * Porters get an 8-hour token so they only log in once per shift.
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import api from '../utils/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [token, setToken]     = useState(null)
  const [loading, setLoading] = useState(true)  // initial hydration check

  // ── Hydrate from localStorage on mount ──────────────────────────────────
  useEffect(() => {
    const storedToken = localStorage.getItem('ds_token')
    const storedUser  = localStorage.getItem('ds_user')
    if (storedToken && storedUser) {
      try {
        setToken(storedToken)
        setUser(JSON.parse(storedUser))
      } catch {
        localStorage.removeItem('ds_token')
        localStorage.removeItem('ds_user')
      }
    }
    setLoading(false)
  }, [])

  // ── Login ────────────────────────────────────────────────────────────────
  const login = useCallback(async (email, password) => {
    // FastAPI OAuth2 expects form-encoded body
    const params = new URLSearchParams()
    params.append('username', email)
    params.append('password', password)

    const { data } = await api.post('/api/auth/login', params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })

    const userData = {
      id:    data.user_id,
      name:  data.name,
      role:  data.role,
      email,
    }

    localStorage.setItem('ds_token', data.access_token)
    localStorage.setItem('ds_user',  JSON.stringify(userData))
    setToken(data.access_token)
    setUser(userData)

    return userData
  }, [])

  // ── Logout ───────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout')
    } catch {
      // silent — token is already gone from backend's perspective
    } finally {
      localStorage.removeItem('ds_token')
      localStorage.removeItem('ds_user')
      setToken(null)
      setUser(null)
    }
  }, [])

  const isManager = user?.role === 'manager' || user?.role === 'admin'
  const isPorter  = user?.role === 'porter'
  const isAdmin   = user?.role === 'admin'

  return (
    <AuthContext.Provider value={{
      user, token, loading,
      isManager, isPorter, isAdmin,
      login, logout,
      isAuthenticated: !!token,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
