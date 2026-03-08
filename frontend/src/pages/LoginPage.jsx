/**
 * DealerSuite — Login Page
 * Simple email + password form.
 * Porters log in once per shift (8-hour JWT).
 * After login, porters → /, managers → /dashboard
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, LogIn } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate  = useNavigate()

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const user = await login(email.trim(), password)
      // Route based on role
      if (user.role === 'manager' || user.role === 'admin') {
        navigate('/dashboard', { replace: true })
      } else {
        navigate('/', { replace: true })
      }
    } catch (err) {
      const msg = err.response?.data?.detail || 'Login failed. Check your email and password.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-brand-dark flex flex-col items-center justify-center px-6 py-10">

      {/* Logo / brand block */}
      <div className="mb-10 text-center">
        <div className="w-20 h-20 bg-brand-blue rounded-3xl flex items-center justify-center
                        mx-auto mb-5 shadow-lg shadow-brand-blue/30">
          <span className="text-4xl">🚗</span>
        </div>
        <h1 className="text-3xl font-extrabold text-brand-white tracking-tight">DealerSuite</h1>
        <p className="text-gray-400 mt-1 text-base">Loaner Inspection</p>
      </div>

      {/* Form card */}
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm flex flex-col gap-5"
      >
        {/* Email */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-gray-300" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@dealership.com"
            required
            className="bg-brand-mid border border-brand-accent rounded-xl px-4 py-4
                       text-brand-white placeholder-gray-600
                       focus:outline-none focus:border-brand-blue
                       transition-colors w-full"
          />
        </div>

        {/* Password */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-gray-300" htmlFor="password">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPw ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="bg-brand-mid border border-brand-accent rounded-xl px-4 py-4 pr-14
                         text-brand-white placeholder-gray-600
                         focus:outline-none focus:border-brand-blue
                         transition-colors w-full"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500"
              tabIndex={-1}
              aria-label={showPw ? 'Hide password' : 'Show password'}
            >
              {showPw ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="bg-red-900/60 border border-red-700 rounded-xl px-4 py-3">
            <p className="text-red-300 text-sm font-medium">{error}</p>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="btn-primary mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <LogIn className="w-6 h-6" />
              Sign In
            </>
          )}
        </button>
      </form>

      <p className="mt-10 text-xs text-gray-600 text-center">
        DealerSuite · Loaner Inspection v0.4
      </p>
    </div>
  )
}
