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

export function useApi(path, jsonBody) {
  const [result, setResult] = useState(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const options = { signal: controller.signal }
    const request = jsonBody === undefined
      ? api.get(path, options)
      : api.post(path, JSON.parse(jsonBody), options)

    request
      .then(({ data }) => {
        if (!controller.signal.aborted) setResult({ path, jsonBody, attempt, data })
      })
      .catch((error) => {
        if (!controller.signal.aborted) setResult({ path, jsonBody, attempt, error })
      })

    return () => controller.abort()
  }, [path, jsonBody, attempt])

  const currentResult = result?.path === path && result.jsonBody === jsonBody && result.attempt === attempt
    ? result
    : null

  return {
    data: currentResult?.data,
    previousData: result?.path === path ? result.data : undefined,
    error: currentResult?.error,
    loading: !currentResult,
    retry: () => setAttempt((previousAttempt) => previousAttempt + 1),
  }
}
