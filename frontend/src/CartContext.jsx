import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useAuth } from './AuthContext.jsx'
import { api } from './api.js'

const CartContext = createContext(null)
const storageKey = 'buyora-cart'

function saveCart(items) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(items))
  } catch {
    // The cart still works for this visit when storage is unavailable.
  }
}

function readCart() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey))
    if (!Array.isArray(saved)) return []

    const products = new Map()
    for (const item of saved) {
      if (typeof item?.productId === 'string' && /^[a-f0-9]{24}$/i.test(item.productId)
        && Number.isInteger(item.quantity) && item.quantity >= 1 && item.quantity <= 99) {
        const productId = item.productId.toLowerCase()
        products.set(productId, { productId, quantity: item.quantity })
      }
    }

    return [...products.values()].slice(0, 50)
  } catch {
    return []
  }
}

export function CartProvider({ children }) {
  const { user } = useAuth()
  const [items, setItems] = useState(readCart)
  const latestItems = useRef(items)
  const currentUser = useRef(user)

  useEffect(() => {
    currentUser.current = user
  }, [user])

  useEffect(() => {
    latestItems.current = items
    saveCart(items)
  }, [items])

  function addItem(product, { onlyIfMissing = false } = {}) {
    if (!user) return 'Sign in to add items to your cart.'

    const current = items.find(({ productId }) => productId === product._id)
    if (current && onlyIfMissing) return ''

    const quantity = (current?.quantity ?? 0) + 1
    if (quantity > product.stock) return 'The available stock is already in your cart.'
    if (quantity > 99) return 'You can add up to 99 of the same product.'
    if (!current && items.length === 50) return 'Your cart can hold up to 50 different products.'

    setItems((previous) => {
      if (current) {
        return previous.map((item) => item.productId === product._id ? { ...item, quantity } : item)
      }

      return [...previous, { productId: product._id, quantity }]
    })
    return ''
  }

  function setQuantity(productId, quantity) {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) return

    setItems((previous) => previous.map((item) => (
      item.productId === productId && (user || quantity <= item.quantity) ? { ...item, quantity } : item
    )))
  }

  function removeItem(productId) {
    setItems((previous) => previous.filter((item) => item.productId !== productId))
  }

  function removeOrderedItems(orderedItems) {
    const ordered = new Map(orderedItems.map(({ productId, quantity }) => [productId, quantity]))
    const remaining = latestItems.current
      .map((item) => ({ ...item, quantity: item.quantity - (ordered.get(item.productId) ?? 0) }))
      .filter(({ quantity }) => quantity > 0)

    latestItems.current = remaining
    saveCart(remaining)
    setItems(remaining)
  }

  async function buyAgain(orderItems) {
    const shopperId = user?.id
    if (!shopperId) throw new Error('Sign in to add items to your cart.')

    const requestedItems = orderItems.map(({ product, quantity }) => ({ productId: product, quantity }))
    const { data } = await api.post('/cart/quote', { items: requestedItems })
    if (currentUser.current?.id !== shopperId) throw new Error('Sign in again before adding these items.')

    const remaining = latestItems.current.map((item) => ({ ...item }))
    const adjustments = []
    let added = 0

    for (const line of data.lines) {
      const { product, productId, quantity } = line
      const name = orderItems.find((item) => item.product === productId)?.name ?? 'Product'
      if (!product || product.stock === 0) {
        adjustments.push(`${name} is unavailable.`)
        continue
      }

      const current = remaining.find((item) => item.productId === productId)
      if (!current && remaining.length >= 50) {
        adjustments.push(`${name} was skipped because your cart holds 50 different products.`)
        continue
      }

      const availableQuantity = Math.max(0, Math.min(product.stock, 99) - (current?.quantity ?? 0))
      const quantityToAdd = Math.min(quantity, availableQuantity)
      if (quantityToAdd > 0) {
        if (current) current.quantity += quantityToAdd
        else remaining.push({ productId, quantity: quantityToAdd })
        added += quantityToAdd
      }
      if (quantityToAdd < quantity) {
        adjustments.push(`${name}: added ${quantityToAdd} of ${quantity} requested, based on current stock and cart limits.`)
      }
    }

    latestItems.current = remaining
    saveCart(remaining)
    setItems(remaining)
    return { added, adjustments }
  }

  const count = items.reduce((total, item) => total + item.quantity, 0)

  return (
    <CartContext.Provider value={{ items, count, addItem, setQuantity, removeItem, removeOrderedItems, buyAgain }}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  return useContext(CartContext)
}
