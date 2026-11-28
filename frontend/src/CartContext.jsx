import { createContext, useContext, useLayoutEffect, useRef, useState } from 'react'
import { useAuth } from './AuthContext.jsx'
import { api, cartStoragePrefix } from './api.js'
import { Loading } from './components/Feedback.jsx'

const CartContext = createContext(null)
const guestCartKey = `${cartStoragePrefix}guest`
const checkoutKeyPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/

export function isCheckoutKey(value) {
  return typeof value === 'string' && checkoutKeyPattern.test(value)
}

async function withCartLock(action) {
  // All tabs finish one cart change before another reads the saved quantities.
  try {
    if (navigator.locks) return await navigator.locks.request('buyora-cart', action)
  } catch (error) {
    if (error.name !== 'SecurityError') throw error
  }
  return action()
}

function saveCart(storageKey, cart) {
  try {
    // Record the transfer first so reopening the tab cannot add the same guest items twice.
    if (cart.mergedGuest) {
      localStorage.setItem(storageKey, JSON.stringify(cart))
      if (JSON.stringify(readCart(guestCartKey).items) === cart.mergedGuest) localStorage.removeItem(guestCartKey)
      delete cart.mergedGuest
    }
    const hasDetails = cart.pending.length || cart.checkoutKey || cart.completedCheckout
    localStorage.setItem(storageKey, JSON.stringify(hasDetails ? cart : cart.items))
    return true
  } catch {
    return false
  }
}

function validItems(list, pending = false) {
  const products = new Map()
  for (const item of Array.isArray(list) ? list : []) {
    if (typeof item?.productId !== 'string' || !/^[a-f0-9]{24}$/i.test(item.productId)
      || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || (!pending && item.quantity > 99)) continue
    const productId = item.productId.toLowerCase()
    products.set(productId, { productId, quantity: item.quantity })
  }
  return pending ? [...products.values()] : [...products.values()].slice(0, 50)
}

function readCart(storageKey) {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey))
    const cart = { items: validItems(Array.isArray(saved) ? saved : saved?.items), pending: validItems(saved?.pending, true) }
    if (typeof saved?.mergedGuest === 'string') cart.mergedGuest = saved.mergedGuest
    if (isCheckoutKey(saved?.checkoutKey)) cart.checkoutKey = saved.checkoutKey
    if (isCheckoutKey(saved?.completedCheckout)) cart.completedCheckout = saved.completedCheckout
    return cart
  } catch {
    return { items: [], pending: [] }
  }
}

function mergeItems(cart, incoming) {
  for (const { productId, quantity } of incoming) {
    const current = cart.items.find((item) => item.productId === productId)
    const fits = current || cart.items.length < 50
    const room = fits ? 99 - (current?.quantity ?? 0) : 0
    const added = Math.min(room, quantity)
    if (current) current.quantity += added
    else if (added) cart.items.push({ productId, quantity: added })

    if (added < quantity) {
      const waiting = cart.pending.find((item) => item.productId === productId)
      if (waiting) waiting.quantity += quantity - added
      else cart.pending.push({ productId, quantity: quantity - added })
    }
  }
}

function itemCount(items) {
  return items.reduce((total, item) => total + item.quantity, 0)
}

export function CartProvider({ children }) {
  const { user } = useAuth()
  const guestCart = useRef(null)
  const storageKey = user?.id ? `${cartStoragePrefix}${user.id}` : guestCartKey

  return <AccountCart key={storageKey} storageKey={storageKey} guestCart={guestCart}>{children}</AccountCart>
}

function AccountCart({ storageKey, guestCart, children }) {
  const isGuest = storageKey === guestCartKey
  const [cart, setCart] = useState(() => (isGuest ? guestCart.current : null) ?? readCart(storageKey))
  const [ready, setReady] = useState(isGuest)
  const memory = useRef(isGuest ? guestCart.current : null)
  const active = useRef(false)

  function currentCart() {
    return memory.current ?? readCart(storageKey)
  }

  function storeCart(next) {
    const saved = saveCart(storageKey, next)
    memory.current = saved ? null : next
    if (isGuest) guestCart.current = memory.current
    setCart(next)
    return saved
  }

  useLayoutEffect(() => {
    active.current = true
    let closed = false
    function sync(event) {
      if (event.type === 'storage' && event.key !== storageKey && event.key !== null) return
      withCartLock(() => {
        if (!closed) setCart(currentCart())
      })
    }
    window.addEventListener('storage', sync)
    window.addEventListener('focus', sync)
    if (isGuest) {
      setCart(currentCart())
    } else {
      withCartLock(() => {
        if (closed) return
        const savedGuest = readCart(guestCartKey)
        const guest = guestCart.current ?? savedGuest
        const next = structuredClone(currentCart())
        if (guest.items.length) {
          const signature = JSON.stringify(savedGuest.items)
          if (guestCart.current || next.mergedGuest !== signature) mergeItems(next, guest.items)
          next.mergedGuest = signature
          storeCart(next)
          guestCart.current = null
        } else if (next.mergedGuest) {
          storeCart(next)
        } else {
          setCart(next)
        }
        setReady(true)
      })
    }
    return () => {
      active.current = false
      closed = true
      window.removeEventListener('storage', sync)
      window.removeEventListener('focus', sync)
    }
  }, [guestCart, isGuest, storageKey])

  function updateCart(change) {
    return withCartLock(() => {
      if (!active.current) return
      const next = structuredClone(currentCart())
      const result = change(next)
      storeCart(next)
      return result
    })
  }

  function addItem(product, { onlyIfMissing = false } = {}) {
    if (!active.current) return 'Cart is unavailable. Try again.'

    return updateCart(({ items }) => {
      const current = items.find(({ productId }) => productId === product._id)
      if (current && onlyIfMissing) return ''

      const quantity = (current?.quantity ?? 0) + 1
      if (quantity > product.stock) return 'The available stock is already in your cart.'
      if (quantity > 99) return 'You can add up to 99 of the same product.'
      if (!current && items.length === 50) return 'Your cart can hold up to 50 different products.'

      if (current) current.quantity = quantity
      else items.push({ productId: product._id, quantity })
      return ''
    })
  }

  function changeQuantity(productId, delta, stock) {
    return updateCart(({ items }) => {
      const item = items.find((entry) => entry.productId === productId)
      if (!item) return
      if (delta === 0) item.quantity = Math.min(item.quantity, stock)
      else if (delta < 0) item.quantity = Math.max(1, item.quantity - 1)
      else if (item.quantity < Math.min(99, stock)) item.quantity += 1
    })
  }

  function removeItem(productId) {
    return updateCart((next) => { next.items = next.items.filter((item) => item.productId !== productId) })
  }

  function prepareCheckout(items, legacyKey) {
    return updateCart((next) => {
      if (next.completedCheckout !== cart.completedCheckout || JSON.stringify(next.items) !== JSON.stringify(items)) return null
      // Tabs share one pending order until its receipt has been applied to the cart.
      next.checkoutKey ??= (legacyKey && legacyKey !== next.completedCheckout) ? legacyKey : crypto.randomUUID()
      return next.checkoutKey
    })
  }

  function finishCheckout(key, orderedItems, legacyKey) {
    const ordered = new Map(orderedItems.map(({ productId, quantity }) => [productId, quantity]))
    return updateCart((next) => {
      const legacyReceipt = key === legacyKey && !next.checkoutKey && !next.completedCheckout
      if (next.checkoutKey !== key && !legacyReceipt) return
      next.items = next.items.map((item) => ({ ...item, quantity: item.quantity - (ordered.get(item.productId) ?? 0) }))
        .filter(({ quantity }) => quantity > 0)
      delete next.checkoutKey
      next.completedCheckout = key
    })
  }

  function retryPending() {
    return updateCart((next) => {
      const waiting = next.pending
      next.pending = []
      mergeItems(next, waiting)
      return itemCount(waiting) - itemCount(next.pending)
    })
  }

  function dismissPending(productId) {
    return updateCart((next) => { next.pending = next.pending.filter((item) => item.productId !== productId) })
  }

  async function buyAgain(orderItems) {
    if (isGuest || !active.current) throw new Error('Sign in to add items to your cart.')

    const requestedItems = orderItems.map(({ product, quantity }) => ({ productId: product, quantity }))
    const { data } = await api.post('/cart/quote', { items: requestedItems })
    if (!active.current) throw new Error('Sign in again before adding these items.')

    return updateCart(({ items }) => addReorderItems(items, data.lines, orderItems))
  }

  function addReorderItems(remaining, lines, orderItems) {
    const adjustments = []
    let added = 0

    for (const line of lines) {
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

    return { added, adjustments }
  }

  if (!ready) return <Loading label="Preparing your cart…" />
  const { items, pending } = cart
  const count = itemCount(items)

  return (
    <CartContext.Provider value={{
      items, pending, count, addItem, changeQuantity, removeItem, buyAgain, retryPending, dismissPending,
      checkoutKey: cart.checkoutKey, prepareCheckout, finishCheckout,
    }}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  return useContext(CartContext)
}
