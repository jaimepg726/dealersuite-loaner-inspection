/**
 * DealerSuite — Axios API Client
 * Automatically attaches the JWT token to every request.
 * Redirects to /login on 401.
 */

import axios from 'axios'

// Production (same-origin Railway deploy): VITE_API_URL=''   → relative /api/*
// Production (separate Railway services): VITE_API_URL=https://api.railway.app
// Local dev: VITE_API_URL unset → '' so Vite proxy handles /api → localhost:8000
const API_URL = import.meta.env.VITE_API_URL ?? ''

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
})

// ── Request interceptor — attach Bearer token ──────────────────────────────
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('ds_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// ── Response interceptor — handle 401 globally ────────────────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('ds_token')
      localStorage.removeItem('ds_user')
      // Redirect to login — but only if not already there
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export default api
