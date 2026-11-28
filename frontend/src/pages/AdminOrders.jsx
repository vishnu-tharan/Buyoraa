import { useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { api, errorMessage, useApi } from '../api.js'
import { Loading, PageMessage, Pagination } from '../components/Feedback.jsx'
import OrderSummary, { orderPaymentLabel, orderStatusLabels, OrderStatusBadge } from '../components/OrderSummary.jsx'
import { formatPrice } from '../components/ProductGrid.jsx'

const dateFormat = new Intl.DateTimeFormat('en-LK', { dateStyle: 'medium', timeZone: 'Asia/Colombo' })
const dateTimeFormat = new Intl.DateTimeFormat('en-LK', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Colombo' })

function orderNumber(id) {
  return `#${id.slice(-8).toUpperCase()}`
}

export function AdminOrdersTable({ orders, selection }) {
  return (
    <div className="admin-table">
      <table>
        <thead><tr>
          {selection && <th scope="col">Select</th>}
          <th scope="col">Order</th>
          <th scope="col">Customer</th>
          <th scope="col">Placed</th>
          <th scope="col">Status</th>
          <th scope="col">Total</th>
        </tr></thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order._id}>
              {selection && <td>{order.orderStatus === 'pending' && (
                <input type="checkbox" aria-label={`Select order ${orderNumber(order._id)}`}
                  checked={selection.selected.includes(order._id)} disabled={selection.saving} onChange={() => selection.toggle(order._id)} />
              )}</td>}
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

function BulkConfirmation({ orders, onComplete }) {
  const [selected, setSelected] = useState([])
  const [saving, setSaving] = useState(false)
  const [results, setResults] = useState(null)
  const [error, setError] = useState('')
  const pending = orders.filter(({ orderStatus }) => orderStatus === 'pending').map(({ _id }) => _id)
  const selection = selected.filter((id) => pending.includes(id))

  function toggle(id) {
    setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])
  }

  async function confirm() {
    if (!selection.length || !window.confirm(`Confirm ${selection.length} selected ${selection.length === 1 ? 'order' : 'orders'}?`)) return
    setSaving(true)
    setResults(null)
    setError('')
    try {
      const { data } = await api.post('/admin/orders/confirm', { orderIds: selection }, { timeout: 20000 })
      setResults(data.results)
      setSelected([])
      onComplete()
    } catch (requestError) {
      setError(errorMessage(requestError, 'We couldn’t verify the confirmation. Retry or reload to check the order statuses.'))
    } finally {
      setSaving(false)
    }
  }

  const skipped = results?.filter(({ outcome }) => outcome === 'skipped') ?? []
  return (
    <>
      {pending.length > 0 && (
        <div className="admin-actions mb-4">
          <button type="button" className="button button-outline" disabled={!selection.length || saving} onClick={confirm}>
            {saving ? 'Confirming…' : `Confirm selected (${selection.length})`}
          </button>
          <button type="button" className="text-link" disabled={saving} onClick={() =>
            setSelected(selection.length === pending.length ? [] : pending)}>
            {selection.length === pending.length ? 'Clear selection' : 'Select pending orders on this page'}
          </button>
        </div>
      )}
      {error && <p className="form-error mb-4" role="alert">{error}</p>}
      {results && (
        <div className="checkout-panel mb-4" role="status">
          <p>{results.filter(({ outcome }) => outcome === 'confirmed').length} confirmed · {results.filter(({ outcome }) => outcome === 'already_confirmed').length} already confirmed · {skipped.length} need attention</p>
          {skipped.length > 0 && <ul className="order-lines">
            {skipped.map(({ orderId, message }) => (
              <li key={orderId}><Link className="text-link" to={`/admin/orders/${orderId}`}>{orderNumber(orderId)}</Link><span>{message}</span></li>
            ))}
          </ul>}
        </div>
      )}
      {orders.length > 0 && <AdminOrdersTable orders={orders} selection={pending.length ? { selected: selection, saving, toggle } : undefined} />}
    </>
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
      <BulkConfirmation key={params.toString()} orders={data?.orders ?? []} onComplete={retry} />
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

function StatusHistory({ order }) {
  const changes = order.statusHistory ?? []
  return (
    <section className="checkout-panel">
      <h2>Order status history</h2>
      <ol className="grid gap-3">
        {changes.toReversed().map(({ _id, from, to, actor, source, changedAt }) => (
          <li key={_id}>
            <p>{orderStatusLabels[from]} → {orderStatusLabels[to]}</p>
            <p className="text-sm text-stone-600">
              {actor.name} ({source}) · <time dateTime={changedAt}>{dateTimeFormat.format(new Date(changedAt))}</time>
            </p>
          </li>
        ))}
        <li>
          <p>Order placed</p>
          <time className="text-sm text-stone-600" dateTime={order.createdAt}>{dateTimeFormat.format(new Date(order.createdAt))}</time>
        </li>
      </ol>
      {(changes[0]?.from ?? order.orderStatus) !== 'pending' && <p className="text-sm">Earlier status changes were not recorded.</p>}
    </section>
  )
}

function Refunds({ order, onSaved }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const attempt = useRef(null)
  const refunds = order.refunds ?? []
  const refunded = refunds.reduce((sum, refund) => sum + refund.amount, 0)
  const remaining = order.totalAmount - refunded

  async function save(event) {
    event.preventDefault()
    const values = Object.fromEntries(new FormData(event.currentTarget))
    const details = JSON.stringify(values)
    if (attempt.current?.details !== details) attempt.current = { id: crypto.randomUUID(), details }
    setSaving(true)
    setError('')
    try {
      await api.post(`/admin/orders/${order._id}/refunds`, { ...values, refundId: attempt.current.id })
      onSaved()
    } catch (requestError) {
      setError(errorMessage(requestError, 'We couldn’t verify that the refund was saved. Try again with the same details.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="checkout-panel">
      <h2>Refund records</h2>
      <p>Refunded {formatPrice(refunded)} · Remaining {formatPrice(remaining)}</p>
      {refunds.length > 0 && (
        <ul className="grid gap-3">
          {refunds.toReversed().map(({ _id, amount, refundedOn, reason, actor }) => (
            <li key={_id}>
              <p><strong>{formatPrice(amount)}</strong> · {dateFormat.format(new Date(refundedOn))}</p>
              <p className="whitespace-pre-wrap wrap-anywhere">{reason}</p>
              <p className="text-sm text-stone-600">Recorded by {actor.name}</p>
            </li>
          ))}
        </ul>
      )}
      {remaining > 0 && (
        <form onSubmit={save}>
          <p className="mb-2 text-sm">Record money after it has been refunded to the customer.</p>
          <fieldset className="account-form" disabled={saving}>
            <label>Amount (LKR)<input name="amount" inputMode="decimal" maxLength={17} required /></label>
            <label>Refund date (Sri Lanka time)<input name="refundedOn" type="date" required /></label>
            <label className="col-span-full">Reason<textarea name="reason" rows={3} maxLength={500} required /></label>
            {error && <p className="form-error col-span-full" role="alert">{error}</p>}
            <button className="button button-outline" type="submit">{saving ? 'Saving…' : 'Record refund'}</button>
          </fieldset>
        </form>
      )}
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
      <div className="mt-5 grid gap-4">
        <StatusHistory order={order} />
        {order.orderStatus === 'returned' && order.paymentStatus === 'paid' && (
          <Refunds key={id} order={order} onSaved={() => {
            setNotice({ message: 'Refund recorded.' })
            retry()
          }} />
        )}
        <AdminNotes key={id} order={order} onSaved={() => {
          setNotice({ message: 'Staff note saved.' })
          retry()
        }} />
      </div>
      {canPrint && <PackingSlip order={order} />}
    </section>
  )
}
