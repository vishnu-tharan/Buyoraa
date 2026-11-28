import { Banknote } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { api, errorMessage, useApi } from '../api.js'
import { useAuth } from '../AuthContext.jsx'
import { useCart } from '../CartContext.jsx'
import AddressFields, { collectAddress } from '../components/AddressFields.jsx'
import { Loading, PageMessage } from '../components/Feedback.jsx'
import OrderSummary from '../components/OrderSummary.jsx'
import { formatPrice } from '../components/ProductGrid.jsx'

function savedCheckout(userId) {
  try {
    const key = sessionStorage.getItem(`buyora-checkout-${userId}`)
    return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(key ?? '') ? key : ''
  } catch {
    return ''
  }
}

function rememberCheckout(userId, key) {
  try {
    const storageKey = `buyora-checkout-${userId}`
    if (key) sessionStorage.setItem(storageKey, key)
    else sessionStorage.removeItem(storageKey)
  } catch {
    // The checkout key also stays in memory while this page is open.
  }
}

function CheckoutForm({ user, existingKey, onReceipt, onRecover }) {
  const { items } = useCart()
  const { data, previousData, loading, error, retry } = useApi('/cart/quote', JSON.stringify({ items }))
  const quote = data ?? previousData
  const savedAddresses = user.addresses ?? []
  const defaultAddress = savedAddresses.find(({ _id }) => _id === user.defaultAddressId) ?? savedAddresses[0]
  const [addressId, setAddressId] = useState(defaultAddress?._id ?? '')
  const address = savedAddresses.find(({ _id }) => _id === addressId) ?? { country: 'Sri Lanka' }
  const attempt = useRef(existingKey)
  const inFlight = useRef(false)
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState('')

  async function submit(event) {
    event.preventDefault()
    if (inFlight.current || loading || !data?.canCheckout) return

    const form = new FormData(event.currentTarget)
    const shippingAddress = {
      ...collectAddress(form),
      name: form.get('name').trim(),
      phone: form.get('phone').trim(),
    }

    if (!attempt.current) attempt.current = crypto.randomUUID()
    rememberCheckout(user.id, attempt.current)
    inFlight.current = true
    setSubmitting(true)
    setNotice('')

    try {
      const { data: placed } = await api.post('/orders', {
        items,
        shippingAddress,
        deliveryInstructions: form.get('deliveryInstructions').trim(),
        checkoutKey: attempt.current,
        expectedTotal: data.totalAmount,
      })
      await onReceipt(placed.receipt)
    } catch (requestError) {
      if (requestError.response?.data?.orderId) {
        onRecover(attempt.current)
        return
      }

      setNotice(errorMessage(requestError, 'We couldn’t confirm the order. Try again or check your orders.'))
      if (requestError.response?.status === 409) retry()
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }

  if (!items.length) return <PageMessage linkTo="/products" linkLabel="Browse products">Your cart is empty.</PageMessage>
  if (loading && !quote) return <Loading label="Checking your cart…" />
  if (error) return <PageMessage error onRetry={retry}>We couldn’t check your cart.</PageMessage>

  return (
    <div className="cart-layout">
      <form onSubmit={submit} className="checkout-panel">
        <h2>Delivery and contact</h2>
        <fieldset className="account-form" disabled={submitting}>
          <label>
            Recipient name
            <input name="name" autoComplete="name" maxLength={100} defaultValue={user.name} required />
          </label>
          <label>
            Phone number
            <input type="tel" name="phone" autoComplete="tel" maxLength={30} defaultValue={user.phone} required />
          </label>
          {savedAddresses.length > 0 && (
            <label>
              Saved address
              <select className="checkout-select" value={addressId} onChange={(event) => setAddressId(event.target.value)}>
                <option value="">Enter a new address</option>
                {savedAddresses.map(({ _id, street, city }) => (
                  <option key={_id} value={_id}>{street}, {city}{_id === user.defaultAddressId ? ' (default)' : ''}</option>
                ))}
              </select>
            </label>
          )}
          <AddressFields key={addressId} address={address} />
          <label className="col-span-full">
            Delivery instructions (optional)
            <textarea name="deliveryInstructions" rows={3} maxLength={300} placeholder="For example, call when you reach the main gate." />
          </label>
        </fieldset>
        <div className="checkout-payment">
          <Banknote size={21} aria-hidden="true" />
          <div>
            <h2>Cash on Delivery</h2>
            <p className="text-sm text-stone-600">Pay when your order arrives.</p>
          </div>
        </div>
        {notice && <p className="form-error" role="alert">{notice}</p>}
        {!loading && !quote.canCheckout && <p className="text-brand-dark-red">Update the unavailable items in your cart before placing the order.</p>}
        <div className="flex flex-wrap gap-3">
          <button type="submit" className="button button-red" disabled={submitting || loading || !quote.canCheckout}>
            {submitting ? 'Placing order…' : 'Place order'}
          </button>
          <Link className="button button-outline" to="/cart">Back to cart</Link>
        </div>
      </form>
      <OrderSummary amounts={quote} loading={loading}>
        <ul className="order-lines">
          {quote.lines.map(({ productId, product, quantity, available, lineTotal }) => (
            <li key={productId}>
              <span>{product?.name ?? 'Unavailable product'} × {quantity}</span>
              <span>{available ? formatPrice(lineTotal) : 'Unavailable'}</span>
            </li>
          ))}
        </ul>
      </OrderSummary>
    </div>
  )
}

function ResumeCheckout({ checkoutKey, user, onReceipt, onRecover }) {
  const { data, loading, error, retry } = useApi(`/orders/checkout/${checkoutKey}`)

  if (loading) return <Loading label="Checking your previous checkout…" />
  if (error) return <PageMessage error onRetry={retry}>We couldn’t check your previous checkout. Try again.</PageMessage>
  if (data.receipt) {
    return (
      <div className="page-message">
        <p>Your previous checkout placed an order.</p>
        <button className="button button-red mt-4" type="button" onClick={() => onReceipt(data.receipt)}>
          View order confirmation
        </button>
      </div>
    )
  }

  return <CheckoutForm user={user} existingKey={checkoutKey} onReceipt={onReceipt} onRecover={onRecover} />
}

export default function Checkout() {
  const { user } = useAuth()
  const { removeOrderedItems } = useCart()
  const navigate = useNavigate()
  const [checkoutKey, setCheckoutKey] = useState(() => savedCheckout(user.id))

  const completing = useRef(false)
  async function complete(receipt) {
    if (completing.current) return
    completing.current = true
    await removeOrderedItems(receipt.items)
    rememberCheckout(user.id, '')
    navigate(`/orders/${receipt.orderId}/success`, { replace: true })
  }

  return (
    <section>
      <div className="page-heading"><h1>Checkout</h1></div>
      {checkoutKey
        ? <ResumeCheckout checkoutKey={checkoutKey} user={user} onReceipt={complete} onRecover={setCheckoutKey} />
        : <CheckoutForm user={user} onReceipt={complete} onRecover={setCheckoutKey} />}
    </section>
  )
}
