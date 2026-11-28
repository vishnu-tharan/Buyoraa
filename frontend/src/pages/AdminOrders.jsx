import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { api, errorMessage, useApi } from '../api.js'
import { Loading, PageMessage, Pagination } from '../components/Feedback.jsx'
import OrderSummary, { orderPaymentLabel, orderStatusLabels, OrderStatusBadge } from '../components/OrderSummary.jsx'
import { formatPrice } from '../components/ProductGrid.jsx'

const dateFormat = new Intl.DateTimeFormat('en-LK', { dateStyle: 'medium', timeZone: 'Asia/Colombo' })

function orderNumber(id) {
  return `#${id.slice(-8).toUpperCase()}`
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
              <td><OrderStatusBadge status={order.orderStatus} /></td>
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
  const search = params.get('q') ?? ''
  const status = params.get('status') ?? ''
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const exportParams = new URLSearchParams(params)
  exportParams.delete('page')

  function applyFilters(event) {
    event.preventDefault()
    const filters = new URLSearchParams()
    for (const [name, value] of new FormData(event.currentTarget)) {
      if (value.trim()) filters.set(name, value.trim())
    }
    setParams(filters)
  }

  return (
    <section>
      <div className="page-heading admin-page-heading">
        <h1>Orders</h1>
        {data && <a className="button button-outline" href={`/api/admin/orders/export?${exportParams}`} download>Download CSV</a>}
      </div>
      <form className="admin-search" key={JSON.stringify([search, status, from, to])} onSubmit={applyFilters}>
        <label>
          Search orders
          <input name="q" type="search" defaultValue={search} maxLength={100} placeholder="Order number, name, or phone" />
        </label>
        <label>
          Order status
          <select name="status" defaultValue={status}>
            <option value="">All statuses</option>
            {Object.entries(orderStatusLabels).map(([status, label]) => <option key={status} value={status}>{label}</option>)}
          </select>
        </label>
        <label>From date<input name="from" type="date" defaultValue={from} /></label>
        <label>To date<input name="to" type="date" defaultValue={to} /></label>
        <button className="button button-red" type="submit">Apply filters</button>
        {(search || status || from || to) && <Link to="/admin/orders" className="text-link">Clear filters</Link>}
      </form>
      {loading && <Loading label="Loading orders…" />}
      {error && <PageMessage error onRetry={retry}>{errorMessage(error, 'We couldn’t load orders.')}</PageMessage>}
      {data?.orders.length === 0 && <PageMessage>No orders match these filters.</PageMessage>}
      {data?.orders.length > 0 && <AdminOrdersTable orders={data.orders} />}
      {data && <Pagination data={data} path="/admin/orders" params={params} label="Admin order pages" />}
    </section>
  )
}

function DeliveryAddress({ address }) {
  return (
    <address className="not-italic wrap-anywhere">
      {address.name}<br />{address.street}<br />{address.city}, {address.postalCode}<br />
      {address.country}<br />{address.phone}
    </address>
  )
}

function DeliveryInstructions({ instructions }) {
  if (!instructions) return null

  return (
    <div>
      <h2>Delivery instructions</h2>
      <p className="whitespace-pre-wrap wrap-anywhere">{instructions}</p>
    </div>
  )
}

function PackingSlip({ order }) {
  return (
    <article className="print-document packing-slip">
      <h1>Buyora packing slip</h1>
      <p>Order {orderNumber(order._id)} · {dateFormat.format(new Date(order.createdAt))}</p>
      <h2>Deliver to</h2>
      <DeliveryAddress address={order.shippingAddress} />
      <DeliveryInstructions instructions={order.deliveryInstructions} />
      <h2>Items</h2>
      <table>
        <thead><tr><th scope="col">Item</th><th scope="col">Quantity</th></tr></thead>
        <tbody>
          {order.orderItems.map((item, index) => (
            <tr key={`${item.product}-${index}`}><td>{item.name}</td><td>{item.quantity}</td></tr>
          ))}
        </tbody>
      </table>
    </article>
  )
}

function OrderStatusForm({ allowedStatuses, saving, onSubmit }) {
  const [selectedStatus, setSelectedStatus] = useState('')

  return (
    <form className="admin-status-form" onSubmit={onSubmit}>
      <label>
        Update order status
        <select name="status" value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value)} disabled={saving} required>
          <option value="" disabled>Choose a status</option>
          {allowedStatuses.map((status) => <option key={status} value={status}>{orderStatusLabels[status]}</option>)}
        </select>
      </label>
      {selectedStatus === 'delivery_failed' && <p className="field-hint">Stock stays reserved until the items are received back and the return is recorded.</p>}
      {selectedStatus === 'returned' && (
        <label>
          Returned items
          <select name="restock" defaultValue="" disabled={saving} required>
            <option value="" disabled>Choose what to do with stock</option>
            <option value="yes">Restock all items</option>
            <option value="no">Record return without restocking</option>
          </select>
          <span className="field-hint">Record the return after receiving all items. Restock only if all items can be sold again.</span>
        </label>
      )}
      <button className="button button-red" disabled={saving} type="submit">
        {saving ? 'Saving…' : 'Save status'}
      </button>
    </form>
  )
}

function AdminNotes({ order, onSaved }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const notes = order.adminNotes ?? []

  async function save(event) {
    event.preventDefault()
    const text = new FormData(event.currentTarget).get('text').trim()
    setSaving(true)
    setError('')
    try {
      await api.post(`/admin/orders/${order._id}/notes`, { text })
      onSaved()
    } catch (requestError) {
      setError(errorMessage(requestError, 'We couldn’t save the note. Try again.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="checkout-panel">
      <h2>Staff notes</h2>
      <p className="text-sm text-stone-600">Visible only to admins.</p>
      {notes.length > 0 && (
        <ul className="grid gap-3">
          {notes.toReversed().map(({ _id, text, author, createdAt }) => (
            <li key={_id}>
              <p className="text-sm text-stone-600">{author} · {dateFormat.format(new Date(createdAt))}</p>
              <p className="whitespace-pre-wrap wrap-anywhere">{text}</p>
            </li>
          ))}
        </ul>
      )}
      {notes.length < 50 ? (
        <form className="account-form" onSubmit={save}>
          <label className="col-span-full">Add a note<textarea name="text" rows={3} maxLength={500} required disabled={saving} /></label>
          {error && <p className="form-error col-span-full" role="alert">{error}</p>}
          <button type="submit" className="button button-outline" disabled={saving}>{saving ? 'Saving…' : 'Save note'}</button>
        </form>
      ) : <p>This order has reached the 50-note limit.</p>}
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
    const form = new FormData(event.currentTarget)
    const status = form.get('status')
    const restock = status === 'returned' ? form.get('restock') === 'yes' : undefined
    setSaving(true)
    setNotice(null)

    try {
      await api.patch(`/admin/orders/${id}/status`, { status, restock })
      setNotice({ message: `Order status updated to ${orderStatusLabels[status]}.` })
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
  const canPrint = !['cancelled', 'delivery_failed', 'returned'].includes(order.orderStatus)

  return (
    <section className="admin-order-details">
      <Link className="text-link mb-4" to="/admin/orders">Back to orders</Link>
      <div className="page-heading admin-page-heading">
        <div>
          <h1>Order {orderNumber(order._id)}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <p>{dateFormat.format(new Date(order.createdAt))}</p>
            <OrderStatusBadge status={order.orderStatus} />
          </div>
        </div>
        {canPrint && (
          <button className="button button-outline" type="button" onClick={() => window.print()}>Print packing slip</button>
        )}
      </div>
      {notice && <p className={notice.error ? 'form-error mb-4' : 'mb-4'} role={notice.error ? 'alert' : 'status'}>{notice.message}</p>}
      <div className="cart-layout">
        <div className="checkout-panel">
          <h2>Customer</h2>
          <p>{order.user?.name ?? address.name}{order.user?.email && <><br />{order.user.email}</>}</p>
          <h2>Delivery address</h2>
          <DeliveryAddress address={address} />
          <DeliveryInstructions instructions={order.deliveryInstructions} />
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
          <p>Cash on Delivery · {orderPaymentLabel(order)}</p>
          {order.orderStatus === 'returned' && (
            <p>{order.returnRestocked ? 'Returned items were added back to stock.' : 'Stock was unchanged when the return was recorded.'}</p>
          )}
          {allowedStatuses.length > 0 && (
            <OrderStatusForm key={`${id}-${order.orderStatus}`} allowedStatuses={allowedStatuses} saving={saving} onSubmit={saveStatus} />
          )}
        </OrderSummary>
      </div>
      <div className="mt-5">
        <AdminNotes key={id} order={order} onSaved={() => {
          setNotice({ message: 'Staff note saved.' })
          retry()
        }} />
      </div>
      {canPrint && <PackingSlip order={order} />}
    </section>
  )
}
