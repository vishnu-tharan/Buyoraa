import { CircleCheck, Copy } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { api, errorMessage, useApi } from '../api.js'
import { useCart } from '../CartContext.jsx'
import { Loading, PageMessage, Pagination } from '../components/Feedback.jsx'
import OrderSummary, { orderPaymentLabel, orderStatusLabels } from '../components/OrderSummary.jsx'
import { formatPrice } from '../components/ProductGrid.jsx'

const orderDate = new Intl.DateTimeFormat('en-LK', { dateStyle: 'medium' })
const deliverySteps = ['pending', 'confirmed', 'shipped', 'delivered']

function OrderProgress({ order }) {
  const { orderStatus, paymentStatus } = order
  if (orderStatus === 'cancelled') return null

  // Returned COD orders were delivered only if payment was collected.
  const currentStep = deliverySteps.indexOf(orderStatus)
  const completedStep = orderStatus === 'returned' && paymentStatus === 'paid' ? 3 : 2

  return (
    <ol className="order-progress" aria-label="Delivery progress">
      {deliverySteps.map((step, index) => (
        <li
          key={step}
          aria-current={index === currentStep ? 'step' : undefined}
          className={index <= (currentStep < 0 ? completedStep : currentStep) ? 'order-progress-reached' : undefined}
        >
          {orderStatusLabels[step]}
          {index < currentStep || (currentStep < 0 && index <= completedStep) ? <span className="sr-only"> (completed)</span> : null}
        </li>
      ))}
    </ol>
  )
}

export function Orders() {
  const [params, setParams] = useSearchParams()
  const { data, loading, error, retry } = useApi(`/orders?${params}`)
  const filtered = Boolean(params.get('q') || params.get('status'))

  function applyFilters(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const nextParams = new URLSearchParams()
    const q = form.get('q').trim()
    const status = form.get('status')
    if (q) nextParams.set('q', q)
    if (status) nextParams.set('status', status)
    setParams(nextParams)
  }

  return (
    <section>
      <div className="page-heading"><h1>My orders</h1></div>
      <form key={params.toString()} className="admin-search" onSubmit={applyFilters}>
        <label>
          Order number
          <input
            type="search" name="q" defaultValue={params.get('q') ?? ''}
            placeholder="#1234ABCD" maxLength={25}
            pattern="#?([a-fA-F0-9]{8}|[a-fA-F0-9]{24})"
            title="Enter the 8-character order number or full order ID, with or without #."
          />
        </label>
        <label>
          Order status
          <select name="status" defaultValue={params.get('status') ?? ''}>
            <option value="">All statuses</option>
            {Object.entries(orderStatusLabels).map(([status, label]) => (
              <option key={status} value={status}>{label}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="button button-red">Apply filters</button>
        {filtered && <Link to="/orders" className="text-link">Clear filters</Link>}
      </form>
      {loading && <Loading label="Loading your orders…" />}
      {error && <PageMessage error onRetry={retry}>{errorMessage(error, 'We couldn’t load your orders.')}</PageMessage>}
      {data?.orders.length === 0 && (
        <PageMessage linkTo={filtered ? '/orders' : data.page > 1 ? '/orders' : '/products'} linkLabel={filtered ? 'View all orders' : data.page > 1 ? 'First page' : 'Browse products'}>
          {filtered ? 'No orders match these filters on this page.' : data.page > 1 ? 'There are no orders on this page.' : 'You haven’t placed any orders yet.'}
        </PageMessage>
      )}
      {data?.orders.length > 0 && (
        <ul className="order-history">
          {data.orders.map((order) => (
            <li key={order._id}>
              <Link to={`/orders/${order._id}`} className="order-entry">
                <div>
                  <h2>Order #{order._id.slice(-8).toUpperCase()}</h2>
                  <p className="text-sm text-stone-600">{orderDate.format(new Date(order.createdAt))}</p>
                </div>
                <span className="stock-status">{orderStatusLabels[order.orderStatus]}</span>
                <span className="font-bold">{formatPrice(order.totalAmount)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {data && <Pagination data={data} path="/orders" params={params} label="Order pages" />}
    </section>
  )
}

function CopyOrderNumber({ orderNumber }) {
  const [message, setMessage] = useState('')

  async function copyOrderNumber() {
    try {
      await navigator.clipboard.writeText(orderNumber)
      setMessage('Order number copied.')
    } catch {
      setMessage('Couldn’t copy the order number. Select and copy it above.')
    }
  }

  return (
    <div className="mt-3">
      <button type="button" className="button button-outline" onClick={copyOrderNumber}>
        <Copy size={16} aria-hidden="true" /> Copy order number
      </button>
      <p className="text-sm text-stone-600" role="status">{message}</p>
    </div>
  )
}

function BuyAgain({ orderItems }) {
  const { buyAgain } = useCart()
  const [adding, setAdding] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const inFlight = useRef(false)

  async function addOrderItems() {
    if (inFlight.current) return
    inFlight.current = true
    setAdding(true)
    setError('')
    setResult(null)
    try {
      setResult(await buyAgain(orderItems))
    } catch (requestError) {
      setError(errorMessage(requestError, 'We couldn’t add these items. Check that you are signed in and try again.'))
    } finally {
      inFlight.current = false
      setAdding(false)
    }
  }

  return (
    <div className="mt-3">
      <p className="mb-2 text-sm text-stone-600">Add these items to your cart at current prices, subject to availability.</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" className="button button-red" onClick={addOrderItems} disabled={adding || result?.added > 0}>
          {adding ? 'Checking availability…' : 'Buy again'}
        </button>
        {result?.added > 0 && <Link className="button button-outline" to="/cart">View cart</Link>}
      </div>
      {error && <p className="form-error mt-3" role="alert">{error}</p>}
      {result && (
        <div className="mt-3 text-sm" role="status">
          <p>{result.added > 0 ? `Added ${result.added} ${result.added === 1 ? 'item' : 'items'} to your cart.` : 'No items were added.'}</p>
          {result.adjustments.length > 0 && <ul className="mt-2 list-disc pl-5">
            {result.adjustments.map((message, index) => <li key={index}>{message}</li>)}
          </ul>}
        </div>
      )}
    </div>
  )
}

function OrderCancellation({ orderId, onResult }) {
  const [confirming, setConfirming] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  async function cancelOrder() {
    setCancelling(true)
    try {
      await api.patch(`/orders/${encodeURIComponent(orderId)}/cancel`)
      onResult({ message: 'Your order was cancelled.' })
    } catch (error) {
      onResult({
        message: errorMessage(error, 'We couldn’t confirm the cancellation. Check your order status and try again.'),
        error: true,
      })
    } finally {
      setCancelling(false)
      setConfirming(false)
    }
  }

  if (!confirming) {
    return (
      <button type="button" className="button button-outline text-brand-dark-red" onClick={() => setConfirming(true)}>
        Cancel order
      </button>
    )
  }

  return (
    <div>
      <p className="mb-3">Are you sure you want to cancel this order?</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="button button-red" onClick={cancelOrder} disabled={cancelling}>
          {cancelling ? 'Cancelling…' : 'Yes, cancel order'}
        </button>
        <button type="button" className="button button-outline" onClick={() => setConfirming(false)} disabled={cancelling}>
          Keep order
        </button>
      </div>
    </div>
  )
}

function OrderPage({ confirmation = false }) {
  const { id } = useParams()
  const { data, loading, error, retry } = useApi(`/orders/${encodeURIComponent(id)}`)
  const [cancellation, setCancellation] = useState(null)

  if (loading) return <Loading label="Loading your order…" />
  if (error) {
    const missing = [400, 404].includes(error.response?.status)
    return (
      <PageMessage error={!missing} onRetry={missing ? undefined : retry} linkTo="/orders" linkLabel="My orders">
        {missing ? 'Order not found.' : 'We couldn’t load this order.'}
      </PageMessage>
    )
  }

  const { order } = data
  const orderNumber = `#${order._id.slice(-8).toUpperCase()}`
  const address = order.shippingAddress
  const cancelled = order.orderStatus === 'cancelled'
  const paymentLabel = orderPaymentLabel(order)
  const canCancel = order.orderStatus === 'pending' && order.paymentStatus === 'pending'
  const cancellationNotice = cancellation?.id === id ? cancellation : null
  const cancellationError = cancellationNotice?.error && !cancelled

  function showCancellationResult({ message, error }) {
    setCancellation({ id, message, error })
    retry()
  }

  if (confirmation) {
    const title = {
      cancelled: 'Order cancelled', delivery_failed: 'Delivery failed', returned: 'Order returned',
    }[order.orderStatus] ?? 'Order placed'

    return (
      <section className="page-message order-confirmation">
        {title === 'Order placed' && <CircleCheck size={44} className="mx-auto mb-3 text-brand-red" aria-hidden="true" />}
        <h1>{title}</h1>
        <p>Order {orderNumber} · {formatPrice(order.totalAmount)}</p>
        {order.paymentStatus === 'pending' && <p>{paymentLabel === 'No payment due' ? 'No payment is due.' : 'Payment is due on delivery.'}</p>}
        <CopyOrderNumber key={order._id} orderNumber={orderNumber} />
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <Link className="button button-red" to={`/orders/${order._id}`}>View order details</Link>
          <Link className="button button-outline" to="/products">Continue shopping</Link>
        </div>
      </section>
    )
  }

  return (
    <section>
      <Link to="/orders" className="text-link mb-4">Back to my orders</Link>
      <div className="page-heading">
        <h1>Order {orderNumber}</h1>
        <p>{orderDate.format(new Date(order.createdAt))}</p>
        <CopyOrderNumber key={order._id} orderNumber={orderNumber} />
      </div>
      <div className="mb-5"><BuyAgain key={order._id} orderItems={order.orderItems} /></div>
      <div className="cart-layout">
        <div className="checkout-panel">
          <h2>Order status</h2>
          <span className="stock-status my-0 w-fit">{orderStatusLabels[order.orderStatus]}</span>
          <OrderProgress order={order} />
          {cancellationNotice && (
            <p className={cancellationError ? 'form-error' : 'text-sm'} role={cancellationError ? 'alert' : 'status'}>
              {cancelled ? 'Your order was cancelled.' : cancellationNotice.message}
            </p>
          )}
          {canCancel && <OrderCancellation key={order._id} orderId={id} onResult={showCancellationResult} />}
          <h2>Items</h2>
          <ul className="order-lines">
            {order.orderItems.map((item, index) => (
              <li key={`${item.product}-${index}`}>
                <span>{item.name} × {item.quantity}</span>
                <span>{formatPrice(item.price * item.quantity)}</span>
              </li>
            ))}
          </ul>
          <h2>Delivery address</h2>
          <address className="not-italic text-stone-600">
            {address.name}<br />
            {address.street}<br />
            {address.city}, {address.postalCode}<br />
            {address.country}<br />
            {address.phone}
          </address>
          {order.deliveryInstructions && (
            <div>
              <h2>Delivery instructions</h2>
              <p className="whitespace-pre-wrap wrap-anywhere text-stone-600">{order.deliveryInstructions}</p>
            </div>
          )}
        </div>
        <OrderSummary amounts={order}>
          <p>Cash on Delivery · {paymentLabel}</p>
        </OrderSummary>
      </div>
    </section>
  )
}

export function OrderDetails() {
  return <OrderPage />
}

export function OrderSuccess() {
  return <OrderPage confirmation />
}
