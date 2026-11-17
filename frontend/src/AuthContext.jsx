import { createContext, useContext, useEffect, useState } from 'react'
import { api } from './api.js'

const AuthContext = createContext(null)

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

    restoreSession()
    return () => controller.abort()
  }, [])

  async function signIn(credentials) {
    const { data } = await api.post('/auth/login', credentials)
    setUser(data.user)
  }

  async function register(details) {
    const { data } = await api.post('/auth/register', details)
    setUser(data.user)
  }

  async function signOut() {
    await api.post('/auth/logout')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, register, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
