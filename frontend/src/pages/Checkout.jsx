import { Banknote } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { api, errorMessage, useApi } from '../api.js'
import { useAuth } from '../AuthContext.jsx'
import { isCheckoutKey, useCart } from '../CartContext.jsx'
import AddressFields, { collectAddress } from '../components/AddressFields.jsx'
import { Loading, PageMessage } from '../components/Feedback.jsx'
import OrderSummary, { DeliveryEstimate } from '../components/OrderSummary.jsx'
import { formatPrice } from '../components/ProductGrid.jsx'

function savedCheckout(userId) {
  try {
    const key = sessionStorage.getItem(`buyora-checkout-${userId}`)
    return isCheckoutKey(key) ? key : ''
  } catch {
    return ''
  }
}

function clearSavedCheckout(userId, key) {
  try {
    const storageKey = `buyora-checkout-${userId}`
    if (sessionStorage.getItem(storageKey) === key) sessionStorage.removeItem(storageKey)
  } catch {
    // Older builds stored checkout keys in this tab.
  }
}

function DiscountEntry({ code, onChange, busy }) {
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')

  function apply(event) {
    event.preventDefault()
    const value = draft.trim().toUpperCase()
    if (!/^[A-Z0-9][A-Z0-9-]{2,23}$/.test(value)) {
      setError('Enter a code of 3 to 24 letters, numbers or hyphens.')
      return
    }
    setError('')
    onChange(value)
  }

  return (
    <form onSubmit={apply} className="account-form">
      <label className="col-span-full">
        Discount code
        <input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={24} disabled={busy} />
      </label>
      {error && <p className="form-error col-span-full" role="alert">{error}</p>}
      <div className="col-span-full flex flex-wrap gap-2">
        <button type="submit" className="button button-outline" disabled={busy || !draft.trim() || draft.trim().toUpperCase() === code}>Apply code</button>
        {code && <button type="button" className="text-link" disabled={busy} onClick={() => {
          onChange('')
          setDraft('')
          setError('')
        }}>Remove code</button>}
      </div>
    </form>
  )
}

function CheckoutForm({ user, legacyKey, onReceipt, onRecover }) {
  const { items, prepareCheckout } = useCart()
  const [discountCode, setDiscountCode] = useState('')
  const { data, previousData, loading, error, retry } = useApi('/cart/quote', JSON.stringify({ items, discountCode, includeDeliveryEstimate: true }))
  const quote = data ?? previousData
  const savedAddresses = user.addresses ?? []
  const defaultAddress = savedAddresses.find(({ _id }) => _id === user.defaultAddressId) ?? savedAddresses[0]
  const [addressId, setAddressId] = useState(defaultAddress?._id ?? '')
  const address = savedAddresses.find(({ _id }) => _id === addressId) ?? { country: 'Sri Lanka' }
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

    inFlight.current = true
    setSubmitting(true)
    setNotice('')

    let checkoutKey
    try {
      checkoutKey = await prepareCheckout(items, legacyKey)
      if (!checkoutKey) {
        setNotice('Your cart changed. Review it before placing an order.')
        retry()
        return
      }
      const { data: placed } = await api.post('/orders', {
        items,
        shippingAddress,
        deliveryInstructions: form.get('deliveryInstructions').trim(),
        checkoutKey,
        discountCode,
        expectedTotal: data.totalAmount,
      })
      await onReceipt(placed.receipt, checkoutKey)
    } catch (requestError) {
      if (requestError.response?.data?.orderId) {
        onRecover(checkoutKey)
        return
      }

      setNotice(errorMessage(requestError, 'We couldn’t confirm the order. Try again or check your orders.'))
      if (requestError.response?.status === 409) retry()
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }

  if (!items.length && !submitting) return <PageMessage linkTo="/products" linkLabel="Browse products">Your cart is empty.</PageMessage>

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
            <DeliveryEstimate estimate={quote?.deliveryEstimate} />
          </div>
        </div>
        {notice && <p className="form-error" role="alert">{notice}</p>}
        {data && !data.canCheckout && !data.discountError && <p className="text-brand-dark-red">Update the unavailable items in your cart before placing the order.</p>}
        <div className="flex flex-wrap gap-3">
          <button type="submit" className="button button-red" disabled={submitting || !data?.canCheckout}>
            {submitting ? 'Placing order…' : 'Place order'}
          </button>
          <Link className="button button-outline" to="/cart">Back to cart</Link>
        </div>
      </form>
      <OrderSummary amounts={data} loading={loading}>
        <DiscountEntry code={discountCode} onChange={(code) => {
          setNotice('')
          setDiscountCode(code)
        }} busy={submitting} />
        {error && <PageMessage error onRetry={retry}>We couldn’t check your cart.</PageMessage>}
        {data?.discountError && <p className="form-error" role="alert">{data.discountError}</p>}
        {quote && (
          <ul className="order-lines">
            {quote.lines.map(({ productId, product, quantity, available, lineTotal }) => (
              <li key={productId}>
                <span>{product?.name ?? 'Unavailable product'} × {quantity}</span>
                <span>{available ? formatPrice(lineTotal) : 'Unavailable'}</span>
              </li>
            ))}
          </ul>
        )}
      </OrderSummary>
    </div>
  )
}

function ResumeCheckout({ checkoutKey, user, legacyKey, onReceipt, onRecover }) {
  const { data, loading, error, retry } = useApi(`/orders/checkout/${checkoutKey}`)

  if (loading) return <Loading label="Checking your previous checkout…" />
  if (error) return <PageMessage error onRetry={retry}>We couldn’t check your previous checkout. Try again.</PageMessage>
  if (data.receipt) {
    return (
      <div className="page-message">
        <p>Your previous checkout placed an order.</p>
        <button className="button button-red mt-4" type="button" onClick={() => onReceipt(data.receipt, checkoutKey)}>
          View order confirmation
        </button>
      </div>
    )
  }

  return <CheckoutForm user={user} legacyKey={legacyKey} onReceipt={onReceipt} onRecover={onRecover} />
}

export default function Checkout() {
  const { user } = useAuth()
  const { checkoutKey, finishCheckout } = useCart()
  const navigate = useNavigate()
  const [legacyKey] = useState(() => savedCheckout(user.id))
  const [recoverKey, setRecoverKey] = useState(() => checkoutKey || legacyKey)

  const completing = useRef(false)
  async function complete(receipt, key) {
    if (completing.current) return
    completing.current = true
    await finishCheckout(key, receipt.items, legacyKey)
    if (legacyKey) clearSavedCheckout(user.id, legacyKey)
    navigate(`/orders/${receipt.orderId}/success`, { replace: true })
  }

  return (
    <section>
      <div className="page-heading"><h1>Checkout</h1></div>
      {recoverKey
        ? <ResumeCheckout checkoutKey={recoverKey} user={user} legacyKey={legacyKey} onReceipt={complete} onRecover={setRecoverKey} />
        : <CheckoutForm user={user} legacyKey={legacyKey} onReceipt={complete} onRecover={setRecoverKey} />}
    </section>
  )
}
