import { formatPrice } from './ProductGrid.jsx'

export const orderStatusLabels = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  shipped: 'Shipped',
  delivered: 'Delivered',
  delivery_failed: 'Delivery failed',
  returned: 'Returned',
  cancelled: 'Cancelled',
}

export function orderPaymentLabel({ orderStatus, paymentStatus }) {
  if (paymentStatus === 'paid') return 'Payment paid'
  if (['cancelled', 'delivery_failed', 'returned'].includes(orderStatus)) return 'No payment due'
  return 'Payment pending'
}

export function OrderStatusBadge({ status }) {
  return <span className="order-status-badge" data-status={status}>{orderStatusLabels[status]}</span>
}

export function DeliveryEstimate({ estimate }) {
  if (!estimate) return null
  const { minDays, maxDays } = estimate
  const days = minDays === maxDays ? minDays : `${minDays}–${maxDays}`
  return <p>Estimated delivery · {days} {maxDays === 1 ? 'day' : 'days'} after ordering</p>
}

export default function OrderSummary({ amounts, loading = false, estimated = false, children }) {
  return (
    <aside className="cart-summary">
      <h2>Order summary</h2>
      {loading ? <p role="status">Checking prices and stock…</p> : (
        <dl>
          <div><dt>Subtotal</dt><dd>{formatPrice(amounts.subtotal)}</dd></div>
          <div><dt>Delivery</dt><dd>{formatPrice(amounts.shippingFee)}</dd></div>
          {amounts.discountAmount > 0 && (
            <div><dt>Discount ({amounts.discountCode})</dt><dd>−{formatPrice(amounts.discountAmount)}</dd></div>
          )}
          <div className="cart-total">
            <dt>{estimated ? 'Estimated total' : 'Total'}</dt>
            <dd>{formatPrice(amounts.totalAmount)}</dd>
          </div>
        </dl>
      )}
      {children}
    </aside>
  )
}
