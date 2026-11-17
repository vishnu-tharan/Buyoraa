import { useEffect, useState } from 'react'
import axios from 'axios'

export const api = axios.create({
  baseURL: '/api',
  timeout: 8000,
  withCredentials: true,
})

export function errorMessage(error, fallback) {
  const message = error.response?.data?.message
  return typeof message === 'string' ? message : fallback
}

export function useApi(path) {
  const [result, setResult] = useState(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    api.get(path, { signal: controller.signal })
      .then(({ data }) => {
        if (!controller.signal.aborted) setResult({ path, attempt, data })
      })
      .catch((error) => {
        if (!controller.signal.aborted) setResult({ path, attempt, error })
      })

    return () => controller.abort()
  }, [path, attempt])

  const currentResult = result?.path === path && result.attempt === attempt ? result : null

  return {
    data: currentResult?.data,
    error: currentResult?.error,
    loading: !currentResult,
    retry: () => setAttempt((previousAttempt) => previousAttempt + 1),
  }
}
