import { createContext, useContext, useEffect, useState } from 'react'
import { api, clearRecentProducts, clearShoppingStorage } from './api.js'

const AuthContext = createContext(null)
const signOutKey = 'buyora-sign-out'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()

    async function restoreSession() {
      try {
        const { data } = await api.get('/auth/me', { signal: controller.signal })
        if (!controller.signal.aborted) setUser(data.user)
      } catch {
        if (!controller.signal.aborted) setUser(null)
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    function handleSignOut(event) {
      if (event.key !== signOutKey || !event.newValue) return
      controller.abort()
      clearShoppingStorage()
      setUser(null)
      setLoading(false)
    }

    window.addEventListener('storage', handleSignOut)
    restoreSession()
    return () => {
      controller.abort()
      window.removeEventListener('storage', handleSignOut)
    }
  }, [])

  async function signIn(credentials) {
    const { data } = await api.post('/auth/login', credentials)
    clearRecentProducts()
    setUser(data.user)
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
    <AuthContext.Provider value={{ user, loading, signIn, register, signOut, updateAccount }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
