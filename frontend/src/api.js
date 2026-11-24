import { useCallback, useEffect, useState } from 'react'
import axios from 'axios'

export const api = axios.create({
  baseURL: '/api',
  timeout: 8000,
  withCredentials: true,
})

const recentProductsKey = 'buyora-recent-products'
export const cartStoragePrefix = 'buyora-cart-'

export function clearRecentProducts() {
  try {
    localStorage.removeItem(recentProductsKey)
  } catch {
    // Storage may be unavailable in this browser.
  }
}

export function clearShoppingStorage() {
  try {
    localStorage.removeItem(recentProductsKey)
    localStorage.removeItem('buyora-cart')
    for (let index = localStorage.length - 1; index >= 0; index--) {
      const key = localStorage.key(index)
      if (key?.startsWith(cartStoragePrefix)) localStorage.removeItem(key)
    }
  } catch {
    // Storage may be unavailable in this browser.
  }
}

export function readRecentProducts() {
  try {
    const saved = JSON.parse(localStorage.getItem(recentProductsKey))
    if (!Array.isArray(saved)) return []

    return [...new Set(saved
      .filter((id) => typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id))
      .map((id) => id.toLowerCase()))].slice(0, 5)
  } catch {
    return []
  }
}

export function rememberProduct(productId) {
  const recent = readRecentProducts().filter((id) => id !== productId)
  try {
    localStorage.setItem(recentProductsKey, JSON.stringify([productId, ...recent].slice(0, 5)))
  } catch {
    // Product browsing still works when browser storage is unavailable.
  }
}

export function errorMessage(error, fallback) {
  const message = error.response?.data?.message
  return typeof message === 'string' ? message : fallback
}

export function useApi(path, jsonBody) {
  const [result, setResult] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt((previousAttempt) => previousAttempt + 1), [])

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
    retry,
  }
}
