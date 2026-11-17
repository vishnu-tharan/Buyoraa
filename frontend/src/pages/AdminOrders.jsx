import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { api, errorMessage, useApi } from '../api.js'
import { Loading, PageMessage, Pagination } from '../components/Feedback.jsx'
import OrderSummary from '../components/OrderSummary.jsx'
import { formatPrice } from '../components/ProductGrid.jsx'

const dateFormat = new Intl.DateTimeFormat('en-LK', { dateStyle: 'medium' })
const statuses = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled']

function orderNumber(id) {
  return `#${id.slice(-8).toUpperCase()}`
}

function statusLabel(status) {
  return status[0].toUpperCase() + status.slice(1)
}

export function AdminOrdersTable({ orders }) {
  return (
    <div className="admin-table">
      <table>
        <thead><tr>
          <th scope="col">Order</th>
          <th scope="col">Customer</th>
          <th scope="col">Placed</th>
          <th scope="col">Status</th>
          <th scope="col">Total</th>
        </tr></thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order._id}>
              <td><Link className="text-link" to={`/admin/orders/${order._id}`}>{orderNumber(order._id)}</Link></td>
              <td>{order.user?.name ?? 'Customer unavailable'}</td>
              <td>{dateFormat.format(new Date(order.createdAt))}</td>
              <td><span className="stock-status my-0 capitalize">{order.orderStatus}</span></td>
              <td>{formatPrice(order.totalAmount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function AdminOrders() {
  const [params, setParams] = useSearchParams()
  const { data, error, loading, retry } = useApi(`/admin/orders?${params}`)

  function changeStatus(event) {
    const status = event.target.value
    setParams(status ? { status } : {})
  }

  return (
    <section>
      <div className="page-heading"><h1>Orders</h1></div>
      <div className="admin-search">
        <label>
          Order status
          <select value={params.get('status') || ''} onChange={changeStatus}>
            <option value="">All statuses</option>
            {statuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
          </select>
        </label>
      </div>
      {loading && <Loading label="Loading orders…" />}
      {error && <PageMessage error onRetry={retry}>{errorMessage(error, 'We couldn’t load orders.')}</PageMessage>}
      {data?.orders.length === 0 && <PageMessage>No orders match this page.</PageMessage>}
      {data?.orders.length > 0 && <AdminOrdersTable orders={data.orders} />}
      {data && <Pagination data={data} path="/admin/orders" params={params} label="Admin order pages" />}
    </section>
  )
}

export function AdminOrderDetails() {
  const { id } = useParams()
  const { data, error, loading, retry } = useApi(`/admin/orders/${encodeURIComponent(id)}`)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(null)

  async function saveStatus(event) {
    event.preventDefault()
    const status = new FormData(event.currentTarget).get('status')
    setSaving(true)
    setNotice(null)

    try {
      await api.patch(`/admin/orders/${id}/status`, { status })
      setNotice({ message: `Order marked ${status}.` })
      retry()
    } catch (requestError) {
      setNotice({ error: true, message: errorMessage(requestError, 'We couldn’t update the order.') })
      if (requestError.response?.status === 409) retry()
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Loading label="Loading the order…" />
  if (error) return <PageMessage error onRetry={retry} linkTo="/admin/orders" linkLabel="Back to orders">{errorMessage(error, 'We couldn’t load the order.')}</PageMessage>

  const { order, allowedStatuses = [] } = data
  const address = order.shippingAddress

  return (
    <section>
      <Link className="text-link mb-4" to="/admin/orders">Back to orders</Link>
      <div className="page-heading">
        <h1>Order {orderNumber(order._id)}</h1>
        <p>{dateFormat.format(new Date(order.createdAt))} · {statusLabel(order.orderStatus)}</p>
      </div>
      {notice && <p className={notice.error ? 'form-error mb-4' : 'mb-4'} role={notice.error ? 'alert' : 'status'}>{notice.message}</p>}
      <div className="cart-layout">
        <div className="checkout-panel">
          <h2>Customer</h2>
          <p>{order.user?.name ?? address.name}{order.user?.email && <><br />{order.user.email}</>}</p>
          <h2>Delivery address</h2>
          <address className="not-italic">
            {address.name}<br />{address.street}<br />{address.city}, {address.postalCode}<br />
            {address.country}<br />{address.phone}
          </address>
          <h2>Purchased items</h2>
          <ul className="order-lines">
            {order.orderItems.map((item, index) => (
              <li key={`${item.product}-${index}`}>
                <span>{item.name} × {item.quantity}</span>
                <span>{formatPrice(item.price * item.quantity)}</span>
              </li>
            ))}
          </ul>
        </div>
        <OrderSummary amounts={order}>
          <p>Cash on Delivery · Payment {order.paymentStatus}</p>
          {allowedStatuses.length > 0 && (
            <form className="admin-status-form" key={order.orderStatus} onSubmit={saveStatus}>
              <label>
                Update order status
                <select name="status" defaultValue="" disabled={saving} required>
                  <option value="" disabled>Choose a status</option>
                  {allowedStatuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
                </select>
              </label>
              <button className="button button-red" disabled={saving} type="submit">
                {saving ? 'Saving…' : 'Save status'}
              </button>
            </form>
          )}
        </OrderSummary>
      </div>
    </section>
  )
}
