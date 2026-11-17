import { Minus, Plus, Trash2 } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { errorMessage, useApi } from '../api.js'
import { useAuth } from '../AuthContext.jsx'
import { useCart } from '../CartContext.jsx'
import { Loading, PageMessage } from '../components/Feedback.jsx'
import OrderSummary from '../components/OrderSummary.jsx'
import { formatPrice, ProductImage } from '../components/ProductGrid.jsx'

function CartItem({ line }) {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const { setQuantity, removeItem } = useCart()
  const { productId, product, quantity, available, lineTotal } = line

  function increaseQuantity() {
    if (user) setQuantity(productId, quantity + 1)
    else navigate('/login', { state: { from: '/cart' } })
  }

  return (
    <li className="shopping-row">
      <div className="shopping-image">
        <ProductImage source={product?.images?.[0]} alt="" />
      </div>
      <div className="shopping-item">
        {product ? (
          <Link className="shopping-title" to={`/products/${productId}`}>{product.name}</Link>
        ) : (
          <p className="shopping-title">Unavailable product</p>
        )}
        {product && <p className="text-sm text-stone-600">{formatPrice(product.price)} each</p>}
        {!available && (
          <p className="mt-1 text-sm text-brand-dark-red">
            {product?.stock > 0 ? `Only ${product.stock} available.` : 'This item is unavailable.'}
          </p>
        )}
        {!available && product?.stock > 0 && (
          <button type="button" className="text-link mt-1" onClick={() => setQuantity(productId, product.stock)}>
            Use available quantity
          </button>
        )}
        {product?.stock > 0 && (
          <div className="quantity-controls" role="group" aria-label={`Quantity for ${product.name}`}>
            <button type="button" aria-label={`Decrease ${product.name} quantity`} disabled={quantity <= 1} onClick={() => setQuantity(productId, quantity - 1)}>
              <Minus size={16} aria-hidden="true" />
            </button>
            <span>{quantity}</span>
            <button
              type="button"
              aria-label={`${user ? 'Increase' : 'Sign in to increase'} ${product.name} quantity`}
              disabled={loading || quantity >= Math.min(product.stock, 99)}
              onClick={increaseQuantity}
            >
              <Plus size={16} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
      <div className="shopping-row-actions">
        {available && lineTotal !== null && <p className="font-bold">{formatPrice(lineTotal)}</p>}
        <button type="button" className="text-link" onClick={() => removeItem(productId)}>
          <Trash2 size={16} aria-hidden="true" /> Remove
        </button>
      </div>
    </li>
  )
}

function CartSummary({ quote, loading }) {
  return (
    <OrderSummary amounts={quote} loading={loading} estimated>
      {!loading && !quote.canCheckout && (
        <p className="text-sm text-brand-dark-red">
          The total includes available items only. Remove unavailable items or lower their quantities.
        </p>
      )}
      {!loading && quote.canCheckout && <Link to="/checkout" className="button button-red">Continue to checkout</Link>}
      <Link to="/products" className="button button-outline">Continue shopping</Link>
    </OrderSummary>
  )
}

function CartContents({ items }) {
  const { data, previousData, error, loading, retry } = useApi('/cart/quote', JSON.stringify({ items }))
  const quote = data ?? previousData

  if (loading && !quote) return <Loading label="Checking prices and stock…" />
  if (error) {
    return (
      <PageMessage error onRetry={retry}>
        {errorMessage(error, 'We couldn’t check the cart. Please try again.')}
      </PageMessage>
    )
  }

  const quantities = new Map(items.map(({ productId, quantity }) => [productId, quantity]))
  const lines = quote.lines.filter(({ productId }) => quantities.has(productId)).map((line) => {
    const quantity = quantities.get(line.productId)
    if (quantity === line.quantity) return line

    return {
      ...line,
      quantity,
      available: Boolean(line.product && line.product.stock >= quantity),
      lineTotal: null,
    }
  })

  return (
    <div className="cart-layout">
      <ul className="shopping-list" aria-label="Cart items">
        {lines.map((line) => <CartItem key={line.productId} line={line} />)}
      </ul>
      <CartSummary quote={quote} loading={loading} />
    </div>
  )
}

export default function Cart() {
  const { items, count } = useCart()

  return (
    <section>
      <div className="page-heading">
        <h1>Shopping cart</h1>
        {count > 0 && <p>{count} {count === 1 ? 'item' : 'items'}</p>}
      </div>
      {items.length ? <CartContents items={items} /> : (
        <PageMessage linkTo="/products" linkLabel="Browse products">Your cart is empty.</PageMessage>
      )}
    </section>
  )
}
