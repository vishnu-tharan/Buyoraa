import { ShoppingBag, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { errorMessage } from '../api.js'
import { useCart } from '../CartContext.jsx'
import { Loading, PageMessage, Toast } from '../components/Feedback.jsx'
import { formatPrice, isBackInStock, ProductImage, StockAlertToggle, useWishlist } from '../components/ProductGrid.jsx'

export default function Wishlist() {
  const { products, stockAlerts, error, loading, retry, changeSaved } = useWishlist()
  const { addItem } = useCart()
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState(null)

  async function removeProduct(product, moveToCart = false) {
    setNotice(null)

    setPending(true)
    try {
      if (moveToCart) {
        const message = await addItem(product, { onlyIfMissing: true })
        if (message) {
          setNotice({ error: true, message })
          return
        }
      }
      await changeSaved(product._id, false)
      setNotice({ message: moveToCart ? 'Moved to your cart.' : 'Removed from your wishlist.' })
    } catch {
      const message = moveToCart
        ? 'The item is in your cart. We couldn’t remove it from your wishlist. Try again.'
        : 'We couldn’t remove this item. Try again.'
      setNotice({ error: true, message })
    } finally {
      setPending(false)
    }
  }

  return (
    <section>
      <div className="page-heading"><h1>Wishlist</h1></div>
      {notice?.error && <p className="form-error mb-4" role="alert">{notice.message}</p>}
      {notice && !notice.error && <Toast notice={notice} onClose={setNotice} />}
      {loading && <Loading label="Loading saved products…" />}
      {error && <PageMessage error onRetry={retry}>{errorMessage(error, 'We couldn’t load your wishlist.')}</PageMessage>}
      {products?.length === 0 && (
        <PageMessage linkTo="/products" linkLabel="Browse products">Your wishlist is empty.</PageMessage>
      )}
      {products?.length > 0 && (
        <ul className="shopping-list" aria-label="Saved products">
          {products.map((product) => (
            <li className="shopping-row" key={product._id}>
              <div className="shopping-image">
                <ProductImage source={product.images[0]} alt="" />
              </div>
              <div className="shopping-item">
                <Link className="shopping-title" to={`/products/${product._id}`}>{product.name}</Link>
                <p className="text-sm text-stone-600">{formatPrice(product.price)}</p>
                {product.stock === 0 && <p className="mt-1 text-sm text-brand-dark-red">Out of stock</p>}
              </div>
              <div className="shopping-row-actions">
                <button type="button" className="button button-red" disabled={pending || product.stock === 0} onClick={() => removeProduct(product, true)}>
                  <ShoppingBag size={16} aria-hidden="true" /> Move to cart
                </button>
                <button type="button" className="text-link disabled:text-stone-500" disabled={pending} onClick={() => removeProduct(product)}>
                  <Trash2 size={16} aria-hidden="true" /> Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {stockAlerts.length > 0 && (
        <section className="checkout-panel mt-5">
          <h2>Stock alerts</h2>
          <ul className="grid gap-3">
            {stockAlerts.map((product) => (
              <li className="flex flex-wrap items-center justify-between gap-2" key={product._id}>
                <div>
                  {product.archived ? <p>{product.name}</p> : <Link className="text-link" to={`/products/${product._id}`}>{product.name}</Link>}
                  <p className="text-sm">{isBackInStock(product) ? 'Back in stock' : 'Currently unavailable'}</p>
                </div>
                <StockAlertToggle product={product} removeOnly />
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  )
}
