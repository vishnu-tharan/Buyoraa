import { createContext, useContext, useEffect, useRef, useState } from 'react'
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
  const activeSession = useRef(null)

  function replaceUser(nextUser) {
    activeSession.current = nextUser ? Symbol() : null
    setUser(nextUser)
  }

  useEffect(() => {
    const controller = new AbortController()
    let checkingSession = null

    const requestInterceptor = api.interceptors.request.use((config) => {
      config.buyoraSession = activeSession.current
      return config
    })

    const responseInterceptor = api.interceptors.response.use(undefined, (error) => {
      const session = error.config?.buyoraSession
      const path = error.config?.url
      if (error.response?.status === 401 && session && session === activeSession.current
        && session !== checkingSession && path !== '/auth/login' && path !== '/auth/me') {
        checkingSession = session
        // An old request can fail after another tab or a password change has refreshed the cookie.
        api.get('/auth/me', { signal: controller.signal })
          .catch((checkError) => {
            if (!controller.signal.aborted && session === activeSession.current && checkError.response?.status === 401) {
              replaceUser(null)
            }
          })
          .finally(() => { if (checkingSession === session) checkingSession = null })
      }
      return Promise.reject(error)
    })

    async function restoreSession() {
      try {
        const { data } = await api.get('/auth/me', { signal: controller.signal })
        if (!controller.signal.aborted) replaceUser(data.user)
      } catch (error) {
        if (controller.signal.aborted) return
        if (error.response?.status === 401) replaceUser(null)
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
      replaceUser(null)
      setSessionError(false)
      setLoading(false)
    }

    window.addEventListener('storage', handleSessionChange)
    restoreSession()
    return () => {
      controller.abort()
      api.interceptors.request.eject(requestInterceptor)
      api.interceptors.response.eject(responseInterceptor)
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
    replaceUser(data.user)
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
    replaceUser(null)
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
