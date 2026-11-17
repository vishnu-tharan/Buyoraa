import { CircleCheck } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { api, errorMessage, useApi } from '../api.js'
import { Loading, PageMessage } from '../components/Feedback.jsx'
import OrderSummary from '../components/OrderSummary.jsx'
import { formatPrice } from '../components/ProductGrid.jsx'

const orderDate = new Intl.DateTimeFormat('en-LK', { dateStyle: 'medium' })

export function Orders() {
  const [params] = useSearchParams()
  const page = params.get('page') ?? '1'
  const { data, loading, error, retry } = useApi(`/orders?page=${encodeURIComponent(page)}`)

  return (
    <section>
      <div className="page-heading"><h1>My orders</h1></div>
      {loading && <Loading label="Loading your orders…" />}
      {error && <PageMessage error onRetry={retry}>{errorMessage(error, 'We couldn’t load your orders.')}</PageMessage>}
      {data?.orders.length === 0 && (
        <PageMessage linkTo={data.page > 1 ? '/orders' : '/products'} linkLabel={data.page > 1 ? 'First page' : 'Browse products'}>
          {data.page > 1 ? 'There are no orders on this page.' : 'You haven’t placed any orders yet.'}
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
                <span className="stock-status capitalize">{order.orderStatus}</span>
                <span className="font-bold">{formatPrice(order.totalAmount)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {data && data.total > data.pageSize && data.orders.length > 0 && (
        <nav className="pagination" aria-label="Order pages">
          {data.page > 1 && <Link className="button button-outline" to={`/orders?page=${data.page - 1}`}>Previous</Link>}
          <span>Page {data.page}</span>
          {data.page < 1000 && data.page * data.pageSize < data.total && (
            <Link className="button button-outline" to={`/orders?page=${data.page + 1}`}>Next</Link>
          )}
        </nav>
      )}
    </section>
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
  const canCancel = order.orderStatus === 'pending' && order.paymentStatus === 'pending'
  const cancellationNotice = cancellation?.id === id ? cancellation : null
  const cancellationError = cancellationNotice?.error && !cancelled

  function showCancellationResult({ message, error }) {
    setCancellation({ id, message, error })
    retry()
  }

  if (confirmation) {
    return (
      <section className="page-message order-confirmation">
        <CircleCheck size={44} className="mx-auto mb-3 text-brand-red" aria-hidden="true" />
        <h1>{cancelled ? 'Order cancelled' : 'Order placed'}</h1>
        <p>Order {orderNumber} · {formatPrice(order.totalAmount)}</p>
        {order.paymentStatus === 'pending' && <p>{cancelled ? 'No payment is due.' : 'Payment is due on delivery.'}</p>}
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
      </div>
      <div className="cart-layout">
        <div className="checkout-panel">
          <h2>Order status</h2>
          <span className="stock-status capitalize my-0 w-fit">{order.orderStatus}</span>
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
        </div>
        <OrderSummary amounts={order}>
          <p>Cash on Delivery · {cancelled && order.paymentStatus === 'pending' ? 'No payment due' : `Payment ${order.paymentStatus}`}</p>
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
