import { LogOut, ShieldCheck, UserRound } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router'
import { errorMessage } from '../api.js'
import { useAuth } from '../AuthContext.jsx'
import { Loading } from '../components/Feedback.jsx'

export function AuthForm({ registerMode = false }) {
  const { user, loading, register, signIn } = useAuth()
  const { state } = useLocation()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const from = state?.from
  const returningToAdmin = typeof from === 'string' && (from === '/admin' || from.startsWith('/admin?'))
  const destination = returningToAdmin ? from : '/account'
  const title = registerMode ? 'Create your account' : 'Sign in'

  if (loading) return <Loading label="Checking your account…" />
  if (user) return <Navigate to={destination} replace />

  async function submit(event) {
    event.preventDefault()
    setError('')
    const form = new FormData(event.currentTarget)
    const email = form.get('email').trim()
    const password = form.get('password')
    const name = registerMode ? form.get('name').trim() : ''

    if (registerMode && !name) {
      setError('Enter your name.')
      return
    }

    if (new TextEncoder().encode(password).length > 72) {
      setError('Use a password of at most 72 bytes.')
      return
    }

    setSubmitting(true)
    try {
      if (registerMode) {
        await register({ name, email, password })
      } else {
        await signIn({ email, password })
      }
    } catch (requestError) {
      setError(errorMessage(requestError, 'We couldn’t complete your request. Try again.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="account-panel">
      <h1>{title}</h1>
      <form onSubmit={submit} className="account-form">
        {registerMode && (
          <label>
            Name
            <input type="text" name="name" autoComplete="name" maxLength={100} required />
          </label>
        )}
        <label>
          Email
          <input type="email" name="email" autoComplete="email" maxLength={254} required />
        </label>
        <label>
          Password
          <input
            type="password"
            name="password"
            autoComplete={registerMode ? 'new-password' : 'current-password'}
            minLength={registerMode ? 8 : undefined}
            required
          />
          {registerMode && <span className="field-hint">Use at least 8 characters.</span>}
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="button button-red" disabled={submitting}>
          {submitting ? 'Please wait…' : registerMode ? 'Create account' : 'Sign in'}
        </button>
      </form>
      <p className="mt-6 text-sm text-stone-600">
        {registerMode ? 'Already have an account? ' : 'New to Buyora? '}
        <Link to={registerMode ? '/login' : '/register'} state={state} className="text-link">
          {registerMode ? 'Sign in' : 'Create an account'}
        </Link>
      </p>
    </section>
  )
}

export function Account() {
  const { user, signOut } = useAuth()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function logout() {
    setError('')
    setSubmitting(true)

    try {
      await signOut()
    } catch (requestError) {
      setError(errorMessage(requestError, 'We couldn’t sign you out. Try again.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="account-panel">
      <h1>My account</h1>
      <div className="account-profile">
        <span className="brand-icon"><UserRound size={19} aria-hidden="true" /></span>
        <div className="min-w-0">
          <h2 className="break-words font-bold">{user.name}</h2>
          <p className="break-words text-sm text-stone-600">{user.email}</p>
        </div>
      </div>
      {error && <p className="form-error mb-4" role="alert">{error}</p>}
      <div className="flex flex-wrap gap-3">
        {user.role === 'admin' && (
          <Link to="/admin" className="button button-red">
            <ShieldCheck size={18} aria-hidden="true" /> Admin area
          </Link>
        )}
        <button type="button" className="button button-outline" onClick={logout} disabled={submitting}>
          <LogOut size={17} aria-hidden="true" /> {submitting ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </section>
  )
}
