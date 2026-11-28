import { Minus, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { errorMessage, useApi } from '../api.js'
import { SessionError, useAuth } from '../AuthContext.jsx'
import { useCart } from '../CartContext.jsx'
import { Loading, PageMessage } from '../components/Feedback.jsx'
import OrderSummary from '../components/OrderSummary.jsx'
import { formatPrice, ProductImage } from '../components/ProductGrid.jsx'

function CartItem({ line }) {
  const { changeQuantity, removeItem } = useCart()
  const { productId, product, quantity, available, lineTotal } = line

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
          <button type="button" className="text-link mt-1" onClick={() => changeQuantity(productId, 0, product.stock)}>
            Use available quantity
          </button>
        )}
        {product?.stock > 0 && (
          <div className="quantity-controls" role="group" aria-label={`Quantity for ${product.name}`}>
            <button type="button" aria-label={`Decrease ${product.name} quantity`} disabled={quantity <= 1} onClick={() => changeQuantity(productId, -1, product.stock)}>
              <Minus size={16} aria-hidden="true" />
            </button>
            <span>{quantity}</span>
            <button
              type="button"
              aria-label={`Increase ${product.name} quantity`}
              disabled={quantity >= Math.min(product.stock, 99)}
              onClick={() => changeQuantity(productId, 1, product.stock)}
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
  const { user, loading: loadingAccount } = useAuth()

  return (
    <OrderSummary amounts={quote} loading={loading} estimated>
      {!loading && !quote.canCheckout && (
        <p className="text-sm text-brand-dark-red">
          The total includes available items only. Remove unavailable items or lower their quantities.
        </p>
      )}
      {!loading && !loadingAccount && quote.canCheckout && (
        <Link to="/checkout" className="button button-red">{user ? 'Continue to checkout' : 'Sign in to check out'}</Link>
      )}
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

function WaitingItems({ items }) {
  const { dismissPending } = useCart()
  // Only product names are needed here. Each quote accepts up to 50 product IDs.
  const lookup = items.map(({ productId }) => ({ productId, quantity: 1 }))
  const { data, error, retry } = useApi('/cart/quote', JSON.stringify({ items: lookup }))
  return (
    <>
      {error && <PageMessage error onRetry={retry}>We couldn’t load the product names.</PageMessage>}
      <ul className="order-lines">
        {items.map(({ productId, quantity }, index) => (
          <li key={productId}>
            <span><Link className="text-link" to={`/products/${productId}`}>{data?.lines[index]?.product?.name ?? (data ? 'Unavailable product' : 'View product')}</Link> × {quantity}</span>
            <button type="button" className="text-link" onClick={() => dismissPending(productId)}>Dismiss</button>
          </li>
        ))}
      </ul>
    </>
  )
}

export default function Cart() {
  const { items, count, pending, retryPending } = useCart()
  const { loading, sessionError } = useAuth()
  const [mergeMessage, setMergeMessage] = useState('')
  async function addWaitingItems() {
    const added = await retryPending()
    setMergeMessage(added ? `Added ${added} ${added === 1 ? 'unit' : 'units'} to your cart.` : 'Your cart is still at its limit. Remove a product or reduce its quantity first.')
  }
  if (loading) return <Loading label="Checking your cart…" />
  if (sessionError) return <SessionError />

  return (
    <section>
      <div className="page-heading">
        <h1>Shopping cart</h1>
        {count > 0 && <p>{count} {count === 1 ? 'item' : 'items'}</p>}
      </div>
      {pending.length > 0 && (
        <section className="checkout-panel mb-4">
          <h2>Items waiting to be added</h2>
          <p>Your cart holds up to 50 different products and 99 of each. Make room and try again, or dismiss an item.</p>
          {Array.from({ length: Math.ceil(pending.length / 50) }, (_, i) => (
            <WaitingItems key={i} items={pending.slice(i * 50, (i + 1) * 50)} />
          ))}
          <button type="button" className="button button-outline" onClick={addWaitingItems}>Add waiting items</button>
        </section>
      )}
      {mergeMessage && <p className="mb-4" role="status">{mergeMessage}</p>}
      {items.length ? <CartContents items={items} /> : (
        <PageMessage linkTo="/products" linkLabel="Browse products">Your cart is empty.</PageMessage>
      )}
    </section>
  )
}
