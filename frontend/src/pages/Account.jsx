import { LogOut, ShieldCheck, UserRound } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { api, errorMessage } from '../api.js'
import { SessionError, useAuth } from '../AuthContext.jsx'
import AddressFields, { collectAddress } from '../components/AddressFields.jsx'
import { Loading } from '../components/Feedback.jsx'

export function AuthForm({ registerMode = false }) {
  const { user, loading, sessionError, register, signIn } = useAuth()
  const { state } = useLocation()
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const from = state?.from
  const allowedReturn = typeof from === 'string'
    && /^\/(?:admin(?:\/(?:products|categories|orders|users|discounts)(?:\/(?:new|[a-f0-9]{24}))?)?(?:\?.*)?|wishlist|cart|checkout|orders(?:\/[a-f0-9]{24}(?:\/success)?)?(?:\?[^#]*)?|products\/[a-f0-9]{24})$/i.test(from)
  const destination = allowedReturn ? from : '/account'
  const title = registerMode ? 'Create your account' : 'Sign in'

  if (loading) return <Loading label="Checking your account…" />
  if (sessionError) return <SessionError />
  if (user) return <Navigate to={destination} state={{ catalogReturn: state?.catalogReturn }} replace />

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
        navigate('/login', { replace: true, state: { from, catalogReturn: state?.catalogReturn, afterRegistration: true } })
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
      {!registerMode && state?.afterRegistration && (
        <p className="mt-3 text-sm" role="status">Registration request received. Sign in to continue.</p>
      )}
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
    <section className="account-panel account-settings">
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
        <Link to="/orders" className="button button-red">My orders</Link>
        {user.role === 'admin' && (
          <Link to="/admin" className="button button-red">
            <ShieldCheck size={18} aria-hidden="true" /> Admin area
          </Link>
        )}
        <button type="button" className="button button-outline" onClick={logout} disabled={submitting}>
          <LogOut size={17} aria-hidden="true" /> {submitting ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
      <ProfileSettings user={user} />
      <PasswordSettings />
      <SavedAddresses user={user} />
    </section>
  )
}

function ProfileSettings({ user }) {
  const { updateAccount } = useAuth()
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(null)

  async function saveProfile(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSaving(true)
    setNotice(null)

    try {
      const { data } = await api.patch('/users/profile', { name: form.get('name'), phone: form.get('phone') })
      updateAccount(data.user.id, { name: data.user.name, phone: data.user.phone })
      setNotice({ message: 'Profile updated.' })
    } catch (requestError) {
      setNotice({ error: true, message: errorMessage(requestError, 'We couldn’t update your profile.') })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="account-section">
      <h2>Profile details</h2>
      <form className="account-form" onSubmit={saveProfile}>
        <label>
          Full name
          <input name="name" maxLength={100} defaultValue={user.name} autoComplete="name" required />
        </label>
        <label>
          Phone number
          <input name="phone" type="tel" maxLength={30} defaultValue={user.phone} autoComplete="tel" />
        </label>
        <button className="button button-outline" type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save profile'}
        </button>
      </form>
      <AccountNotice notice={notice} />
    </section>
  )
}

function PasswordSettings() {
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(null)

  async function savePassword(event) {
    event.preventDefault()
    const form = event.currentTarget
    const fields = new FormData(form)
    const currentPassword = fields.get('currentPassword')
    const newPassword = fields.get('newPassword')
    const confirmation = fields.get('confirmPassword')

    if (newPassword !== confirmation) {
      setNotice({ error: true, message: 'The new passwords don’t match.' })
      return
    }
    if (new TextEncoder().encode(newPassword).length > 72) {
      setNotice({ error: true, message: 'Use a new password of at most 72 bytes.' })
      return
    }

    setSaving(true)
    setNotice(null)
    try {
      await api.patch('/auth/password', { currentPassword, newPassword })
      form.reset()
      setNotice({ message: 'Password changed. Your other sessions have been signed out.' })
    } catch (requestError) {
      setNotice({ error: true, message: errorMessage(requestError, 'We couldn’t change your password. Try again.') })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="account-section" aria-labelledby="password-heading">
      <h2 id="password-heading">Change password</h2>
      <form onSubmit={savePassword}>
        <fieldset className="account-form" disabled={saving}>
          <label>
            Current password
            <input name="currentPassword" type="password" autoComplete="current-password" required />
          </label>
          <label>
            New password
            <input name="newPassword" type="password" autoComplete="new-password" minLength={8} required />
            <span className="field-hint">Use at least 8 characters.</span>
          </label>
          <label>
            Confirm new password
            <input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required />
          </label>
          <button className="button button-outline" type="submit">
            {saving ? 'Changing password…' : 'Change password'}
          </button>
        </fieldset>
      </form>
      <AccountNotice notice={notice} />
    </section>
  )
}

function SavedAddresses({ user }) {
  const { updateAccount } = useAuth()
  const addresses = user.addresses ?? []
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(null)
  const selectedAddress = addresses.find(({ _id }) => _id === editing)

  async function updateAddress(method, path, address, message) {
    setSaving(true)
    setNotice(null)

    try {
      const { data } = await api.request({ method, url: path, data: address })
      updateAccount(data.user.id, { addresses: data.user.addresses, defaultAddressId: data.user.defaultAddressId })
      setEditing(null)
      setNotice({ message })
    } catch (requestError) {
      setNotice({ error: true, message: errorMessage(requestError, 'We couldn’t update your addresses.') })
    } finally {
      setSaving(false)
    }
  }

  function saveAddress(event) {
    event.preventDefault()
    const address = collectAddress(new FormData(event.currentTarget))
    if (editing === 'new') {
      updateAddress('post', '/users/addresses', address, 'Address saved.')
    } else {
      updateAddress('patch', `/users/addresses/${editing}`, address, 'Address updated.')
    }
  }

  return (
    <section className="account-section">
      <h2>Saved delivery addresses</h2>
      {addresses.length === 0 && <p className="mt-2 text-sm text-stone-600">No delivery addresses saved yet.</p>}
      <ul className="address-list">
        {addresses.map((address) => (
          <li key={address._id}>
            <div className="min-w-0">
              <p className="break-words font-semibold">{address.street}</p>
              <p className="break-words text-sm text-stone-600">{address.city}, {address.postalCode}, {address.country}</p>
              {user.defaultAddressId === address._id && <p className="text-sm font-semibold mt-1">Default shipping address</p>}
            </div>
            <div className="flex flex-wrap gap-3">
              <button className="text-link" type="button" disabled={saving} onClick={() => setEditing(address._id)}>Edit</button>
              {user.defaultAddressId !== address._id && (
                <button className="text-link" type="button" disabled={saving} onClick={() => updateAddress('patch', `/users/addresses/${address._id}/default`, undefined, 'Default shipping address updated.')}>Make default</button>
              )}
              <button className="text-link" type="button" disabled={saving} onClick={() => updateAddress('delete', `/users/addresses/${address._id}`, undefined, 'Address removed.')}>Remove</button>
            </div>
          </li>
        ))}
      </ul>
      {editing ? (
        <form className="account-form" key={editing} onSubmit={saveAddress} aria-label={editing === 'new' ? 'Add address' : 'Edit address'}>
          <AddressFields address={selectedAddress ?? { country: 'Sri Lanka' }} />
          <div className="flex flex-wrap gap-3">
            <button className="button button-red" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save address'}</button>
            <button className="button button-outline" type="button" disabled={saving} onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </form>
      ) : (
        <button className="button button-outline mt-3" type="button" disabled={saving || addresses.length >= 10} onClick={() => setEditing('new')}>
          Add address
        </button>
      )}
      <AccountNotice notice={notice} />
    </section>
  )
}

function AccountNotice({ notice }) {
  if (!notice) return null

  return (
    <p className={notice.error ? 'form-error mt-3' : 'mt-3 text-sm'} role={notice.error ? 'alert' : 'status'}>
      {notice.message}
    </p>
  )
}
