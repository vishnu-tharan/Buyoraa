import { Bell, Heart, ImageIcon, ShoppingBag, Star } from 'lucide-react'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { api, errorMessage, useApi } from '../api.js'
import { useAuth } from '../AuthContext.jsx'
import { useCart } from '../CartContext.jsx'

const currency = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' })
const WishlistContext = createContext(null)

export function WishlistProvider({ children }) {
  const { user } = useAuth()
  return user ? <SignedInWishlist key={user.id}>{children}</SignedInWishlist> : children
}

function SignedInWishlist({ children }) {
  const { data, previousData, loading, error, retry } = useApi('/wishlist')
  const { pathname } = useLocation()
  const lastPath = useRef(pathname)
  const [saving, setSaving] = useState(false)
  const busy = useRef(false)
  const products = (data ?? previousData)?.products
  const stockAlerts = (data ?? previousData)?.stockAlerts ?? []

  useEffect(() => {
    if (lastPath.current === pathname) return
    lastPath.current = pathname
    if (pathname === '/wishlist' || stockAlerts.length) retry()
  }, [pathname, retry, stockAlerts.length])

  useEffect(() => {
    window.addEventListener('focus', retry)
    return () => window.removeEventListener('focus', retry)
  }, [retry])

  async function changeItem(path, saved) {
    if (busy.current) throw new Error('A wishlist update is already in progress.')
    busy.current = true
    setSaving(true)
    try {
      await api.request({ method: saved ? 'put' : 'delete', url: path })
      retry()
    } finally {
      busy.current = false
      setSaving(false)
    }
  }

  return (
    <WishlistContext.Provider value={{
      products, stockAlerts, loading, error, retry, saving,
      changeSaved: (productId, saved) => changeItem(`/wishlist/${productId}`, saved),
      changeAlert: (productId, saved) => changeItem(`/wishlist/stock-alerts/${productId}`, saved),
    }}>{children}</WishlistContext.Provider>
  )
}

export function useWishlist() {
  return useContext(WishlistContext)
}

export function isBackInStock(product) {
  return !product.archived && product.stock > 0
}

export function StockAlertToggle({ product, removeOnly = false }) {
  const wishlist = useWishlist()
  const [notice, setNotice] = useState(null)
  if (!wishlist) return null

  const following = removeOnly || wishlist.stockAlerts.some(({ _id }) => _id === product._id)
  if (!following && product.stock > 0) return null
  const enabled = !wishlist.loading && !wishlist.saving

  async function toggle() {
    setNotice(null)
    if (wishlist.error) {
      wishlist.retry()
      return
    }
    try {
      await wishlist.changeAlert(product._id, !following)
      setNotice({ message: following ? 'Stock alert removed.' : 'Stock alert added to your wishlist.' })
    } catch (error) {
      setNotice({ error: true, message: errorMessage(error, 'We couldn’t update this stock alert. Try again.') })
    }
  }

  return (
    <div>
      <button type="button" className="button button-outline" disabled={!enabled} onClick={toggle}>
        <Bell size={16} aria-hidden="true" />
        {wishlist.error ? 'Retry stock alerts' : following ? 'Remove stock alert' : 'Notify me when in stock'}
      </button>
      {notice && <p className="text-sm" role={notice.error ? 'alert' : 'status'}>{notice.message}</p>}
    </div>
  )
}

export function WishlistToggle({ product, iconOnly = false }) {
  const wishlist = useWishlist()
  const [failure, setFailure] = useState('')
  if (!wishlist) return null

  const saved = wishlist.products?.some(({ _id }) => _id === product._id) ?? false
  const label = wishlist.error ? 'Retry wishlist' : saved ? 'Remove from wishlist' : 'Save to wishlist'

  async function toggle() {
    setFailure('')
    if (wishlist.error) {
      wishlist.retry()
      return
    }

    try {
      await wishlist.changeSaved(product._id, !saved)
    } catch (error) {
      setFailure(errorMessage(error, 'We couldn’t update your wishlist. Try again.'))
    }
  }

  return (
    <div className={iconOnly ? 'product-heart' : undefined}>
      <button type="button" className={iconOnly ? 'product-heart-button' : 'button button-outline'}
        aria-label={iconOnly ? `${label} · ${product.name}` : undefined} aria-pressed={wishlist.error ? undefined : saved}
        title={iconOnly ? failure || label : undefined} disabled={wishlist.loading || wishlist.saving} onClick={toggle}>
        <Heart size={18} aria-hidden="true" fill={saved ? 'currentColor' : 'none'} />
        {!iconOnly && (wishlist.loading ? 'Checking wishlist…' : label)}
      </button>
      {failure && <p role="alert" className={iconOnly ? 'product-heart-error' : 'form-error mt-2'}>{failure}</p>}
    </div>
  )
}

export function formatPrice(price) {
  return currency.format(price / 100)
}

export function ProductImage({ source, alt, eager = false }) {
  const [failedSource, setFailedSource] = useState(null)
  const imageUrl = window.location.protocol === 'https:' ? source?.replace(/^http:\/\//i, 'https://') : source

  if (!imageUrl || imageUrl === failedSource) {
    return (
      <div className="product-image product-image-empty" role="img" aria-label={alt || 'Product image unavailable'}>
        <ImageIcon size={28} aria-hidden="true" />
      </div>
    )
  }

  return (
    <img
      className="product-image"
      src={imageUrl}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      onError={() => setFailedSource(imageUrl)}
    />
  )
}

function ProductCard({ product, linkState }) {
  const { loading, sessionError } = useAuth()
  const { addItem } = useCart()
  const [adding, setAdding] = useState(false)
  const [notice, setNotice] = useState(null)
  const lowStock = product.stock >= 1 && product.stock <= 5
  const stockLabel = product.stock === 0 ? 'Sold out' : lowStock ? `Only ${product.stock} left` : ''

  async function addToCart() {
    setAdding(true)
    setNotice(null)
    try {
      const message = await addItem(product)
      setNotice(message ? { message, error: true } : { message: 'Added to cart.' })
    } catch {
      setNotice({ message: 'We couldn’t update your cart. Try again.', error: true })
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="product-card-shell">
      <Link to={`/products/${product._id}`} state={linkState} className="product-card">
        <div className="product-card-media">
          <ProductImage source={product.images[0]} alt="" />
          {stockLabel && <span className={`product-stock-badge${product.stock === 0 ? ' product-stock-sold-out' : ''}`}>{stockLabel}</span>}
        </div>
        <div className="product-card-info">
          <p className="text-sm text-stone-600">{product.category?.name}</p>
          <h3 className="mt-1 font-semibold">{product.name}</h3>
          <ProductRating rating={product.rating} />
          <p className="product-card-price">{formatPrice(product.price)}</p>
        </div>
      </Link>
      <WishlistToggle product={product} iconOnly />
      <div className="product-card-actions">
        <button type="button" className="button button-outline" onClick={addToCart}
          aria-label={`Add ${product.name} to cart`} disabled={loading || sessionError || adding || product.stock === 0}>
          <ShoppingBag size={16} aria-hidden="true" />
          {adding ? 'Adding…' : 'Add to cart'}
        </button>
        {notice && <p className="text-sm" role={notice.error ? 'alert' : 'status'}>{notice.message}</p>}
      </div>
    </div>
  )
}

export function ProductRating({ rating }) {
  if (!rating?.count) return null
  const average = rating.average.toFixed(1)
  return (
    <span className="product-rating" aria-label={`${average} out of 5 stars, ${rating.count} reviews`}>
      <Star size={15} fill="currentColor" aria-hidden="true" /> {average} ({rating.count})
    </span>
  )
}

export default function ProductGrid({ products, linkState }) {
  return (
    <div className="product-grid">
      {products.map((product) => <ProductCard key={product._id} product={product} linkState={linkState} />)}
    </div>
  )
}

export function ProductGridSkeleton() {
  return (
    <div role="status">
      <span className="sr-only">Loading products…</span>
      <div className="product-grid" aria-hidden="true">
        {[1, 2, 3, 4].map((item) => (
          <div className="product-card motion-safe:animate-pulse" key={item}>
            <div className="product-image" />
            <div className="product-card-info product-skeleton-lines"><span /><span /></div>
          </div>
        ))}
      </div>
    </div>
  )
}
