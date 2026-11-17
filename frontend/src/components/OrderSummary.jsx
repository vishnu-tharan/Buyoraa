import { formatPrice } from './ProductGrid.jsx'

export default function OrderSummary({ amounts, loading = false, estimated = false, children }) {
  return (
    <aside className="cart-summary">
      <h2>Order summary</h2>
      {loading ? <p role="status">Checking prices and stock…</p> : (
        <dl>
          <div><dt>Subtotal</dt><dd>{formatPrice(amounts.subtotal)}</dd></div>
          <div><dt>Delivery</dt><dd>{formatPrice(amounts.shippingFee)}</dd></div>
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
