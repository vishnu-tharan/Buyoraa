import { createContext, useContext, useEffect, useState } from 'react'
import { api, clearRecentProducts, clearShoppingStorage } from './api.js'
import { PageMessage } from './components/Feedback.jsx'

const AuthContext = createContext(null)
const signOutKey = 'buyora-sign-out'
const signInKey = 'buyora-sign-in'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sessionError, setSessionError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    async function restoreSession() {
      try {
        const { data } = await api.get('/auth/me', { signal: controller.signal })
        if (!controller.signal.aborted) setUser(data.user)
      } catch (error) {
        if (controller.signal.aborted) return
        if (error.response?.status === 401) setUser(null)
        else setSessionError(true)
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    function handleSessionChange(event) {
      if (event.key === signInKey && event.newValue) {
        controller.abort()
        retrySession()
        return
      }
      if (event.key !== signOutKey || !event.newValue) return
      controller.abort()
      clearShoppingStorage()
      setUser(null)
      setSessionError(false)
      setLoading(false)
    }

    window.addEventListener('storage', handleSessionChange)
    restoreSession()
    return () => {
      controller.abort()
      window.removeEventListener('storage', handleSessionChange)
    }
  }, [attempt])

  function retrySession() {
    setLoading(true)
    setSessionError(false)
    setAttempt((current) => current + 1)
  }

  async function signIn(credentials) {
    const { data } = await api.post('/auth/login', credentials)
    clearRecentProducts()
    setUser(data.user)
    try {
      localStorage.setItem(signInKey, String(Date.now()))
    } catch {
      // This tab can still sign in when storage is unavailable.
    }
  }

  async function register(details) {
    await api.post('/auth/register', details)
  }

  async function signOut() {
    await api.post('/auth/logout')
    clearShoppingStorage()
    try {
      localStorage.setItem(signOutKey, String(Date.now()))
    } catch {
      // Sign-out still works when storage is unavailable.
    }
    setUser(null)
  }

  function updateAccount(userId, changes) {
    setUser((current) => current?.id === userId ? { ...current, ...changes } : current)
  }

  return (
    <AuthContext.Provider value={{ user, loading, sessionError, retrySession, signIn, register, signOut, updateAccount }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

export function SessionError() {
  const { retrySession } = useAuth()
  return <PageMessage error onRetry={retrySession}>We couldn’t check your account. Check your connection and try again.</PageMessage>
}
