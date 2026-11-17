import { createContext, useContext, useEffect, useRef, useState } from 'react'

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
  const [items, setItems] = useState(readCart)
  const latestItems = useRef(items)

  useEffect(() => {
    latestItems.current = items
    saveCart(items)
  }, [items])

  function addItem(product, { onlyIfMissing = false } = {}) {
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
      item.productId === productId ? { ...item, quantity } : item
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

  const count = items.reduce((total, item) => total + item.quantity, 0)

  return (
    <CartContext.Provider value={{ items, count, addItem, setQuantity, removeItem, removeOrderedItems }}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  return useContext(CartContext)
}
