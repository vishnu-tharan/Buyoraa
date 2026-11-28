import { ClipboardList, LayoutDashboard, Package, Tag, Tags, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, Outlet, useSearchParams } from 'react-router'
import { api, errorMessage, useApi } from '../api.js'
import { Loading, PageMessage, Pagination } from '../components/Feedback.jsx'
import { formatPrice } from '../components/ProductGrid.jsx'
import { BrandLink, StoreSearch } from '../components/StoreLayout.jsx'
import { AdminOrdersTable } from './AdminOrders.jsx'

const dateFormat = new Intl.DateTimeFormat('en-LK', { dateStyle: 'medium' })
const salesDayFormat = new Intl.DateTimeFormat('en-LK', { weekday: 'short', timeZone: 'Asia/Colombo' })
const expiryFormat = new Intl.DateTimeFormat('en-LK', { dateStyle: 'medium', timeZone: 'Asia/Colombo' })
const compactSales = new Intl.NumberFormat('en-LK', { notation: 'compact', maximumFractionDigits: 1 })

const adminLinks = [
  { path: '/admin', label: 'Overview', Icon: LayoutDashboard },
  { path: '/admin/products', label: 'Products', Icon: Package },
  { path: '/admin/categories', label: 'Categories', Icon: Tags },
  { path: '/admin/orders', label: 'Orders', Icon: ClipboardList },
  { path: '/admin/discounts', label: 'Discounts', Icon: Tag },
  { path: '/admin/users', label: 'Customers', Icon: UsersRound },
]

function AdminSidebar() {
  return (
    <nav aria-label="Admin navigation" className="admin-sidebar">
      {adminLinks.map(({ path, label, Icon }) => (
        <NavLink end={path === '/admin'} key={path} to={path}>
          <Icon size={18} aria-hidden="true" /> {label}
        </NavLink>
      ))}
    </nav>
  )
}

export function AdminLayout() {
  return (
    <div className="shell admin-layout">
      <header className="admin-header">
        <BrandLink />
        <StoreSearch />
        <Link to="/account" className="text-link">My account</Link>
      </header>
      <div className="admin-workspace">
        <AdminSidebar />
        <main className="min-w-0"><Outlet /></main>
      </div>
    </div>
  )
}

function RestockNotice({ count, products }) {
  return (
    <section className="checkout-panel">
      <h2>Needs restocking</h2>
      {count ? (
        <>
          <p className="text-sm">{count} {count === 1 ? 'product has' : 'products have'} 5 units or fewer.</p>
          <ul className="order-lines">
            {products.map(({ _id, name, stock }) => (
              <li key={_id}><Link to={`/admin/products/${_id}`} className="text-link">{name}</Link><span>{stock === 0 ? 'Sold out' : `${stock} left`}</span></li>
            ))}
          </ul>
          {count > products.length && <Link to="/admin/products" className="text-link">View products</Link>}
        </>
      ) : <p className="text-sm">All active products have more than 5 units.</p>}
    </section>
  )
}

function SalesChart({ sales }) {
  const peak = Math.max(1, ...sales.map(({ revenue }) => revenue))

  return (
    <section className="checkout-panel">
      <h2>Collected sales · Last 7 days</h2>
      <p className="text-sm text-stone-600">LKR · Sri Lanka time</p>
      <ol className="sales-chart" aria-label="Daily collected sales">
        {sales.map(({ date, revenue }) => (
          <li key={date} title={`${date}: ${formatPrice(revenue)}`}>
            <span aria-hidden="true" className="sales-chart-amount">{compactSales.format(revenue / 100)}</span>
            <span aria-hidden="true" className="sales-chart-track"><span style={{ height: `${revenue ? Math.max(4, 100 * revenue / peak) : 0}%` }} /></span>
            <time dateTime={date}>{salesDayFormat.format(new Date(date))}</time>
            <span className="sr-only">{date}: {formatPrice(revenue)}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function DeliverySettings() {
  const { data, error, loading, retry } = useApi('/admin/delivery-estimate')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(null)

  async function save(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSaving(true)
    setNotice(null)
    try {
      await api.put('/admin/delivery-estimate', { minDays: Number(form.get('minDays')), maxDays: Number(form.get('maxDays')) })
      setNotice({ message: 'Delivery estimate saved.' })
      retry()
    } catch (requestError) {
      setNotice({ error: true, message: errorMessage(requestError, 'We couldn’t save the delivery estimate.') })
    } finally {
      setSaving(false)
    }
  }

  const estimate = data?.deliveryEstimate
  return (
    <section className="checkout-panel">
      <h2>Delivery estimate</h2>
      <p>Set the number of calendar days after ordering to show at checkout.</p>
      {loading && <Loading label="Loading delivery estimate…" />}
      {error && <PageMessage error onRetry={retry}>We couldn’t load the delivery estimate.</PageMessage>}
      {notice && <p role={notice.error ? 'alert' : 'status'}>{notice.message}</p>}
      {data && (
        <form className="admin-search" onSubmit={save}>
          <label>Minimum days<input type="number" name="minDays" min="1" max="60" defaultValue={estimate?.minDays} disabled={saving} required /></label>
          <label>Maximum days<input type="number" name="maxDays" min="1" max="60" defaultValue={estimate?.maxDays} disabled={saving} required /></label>
          <button type="submit" className="button button-outline" disabled={saving}>{saving ? 'Saving…' : 'Save estimate'}</button>
        </form>
      )}
    </section>
  )
}

export default function AdminOverview() {
  const { data, error, loading, retry } = useApi('/admin/overview')

  return (
    <section>
      <div className="page-heading"><h1>Admin dashboard</h1></div>
      {loading && <Loading label="Loading dashboard…" />}
      {error && <PageMessage error onRetry={retry}>{errorMessage(error, 'We couldn’t load the dashboard.')}</PageMessage>}
      {data && (
        <>
          <dl className="admin-stats">
            <div><dt>Active products</dt><dd>{data.productCount}</dd></div>
            <div><dt>Customers</dt><dd>{data.customerCount}</dd></div>
            <div><dt>Orders</dt><dd>{data.orderCount}</dd></div>
            <div><dt>Collected sales</dt><dd>{formatPrice(data.revenue)}</dd></div>
          </dl>
          <div className="admin-insights">
            <RestockNotice count={data.lowStockCount} products={data.lowStockProducts} />
            <SalesChart sales={data.sales} />
          </div>
          <DeliverySettings />
          <div className="section-heading mt-6">
            <h2>Recent orders</h2>
            <Link to="/admin/orders" className="text-link">View all orders</Link>
          </div>
          {data.recentOrders.length
            ? <AdminOrdersTable orders={data.recentOrders} />
            : <PageMessage>No orders have been placed yet.</PageMessage>}
        </>
      )}
    </section>
  )
}

export function AdminUsers() {
  const [params, setParams] = useSearchParams()
  const { data, error, loading, retry } = useApi(`/admin/users?${params}`)

  function search(event) {
    event.preventDefault()
    const q = new FormData(event.currentTarget).get('q').trim()
    setParams(q ? { q } : {})
  }

  return (
    <section>
      <div className="page-heading"><h1>Customers</h1></div>
      <form key={params.get('q') ?? ''} onSubmit={search} className="admin-search">
        <label>
          Search customers
          <input name="q" type="search" maxLength={100} placeholder="Name or email" defaultValue={params.get('q') ?? ''} />
        </label>
        <button type="submit" className="button button-red">Search</button>
        {params.has('q') && <Link to="/admin/users" className="text-link">Clear</Link>}
      </form>
      {loading && <Loading label="Loading customers…" />}
      {error && <PageMessage error onRetry={retry}>{errorMessage(error, 'We couldn’t load the customers.')}</PageMessage>}
      {data?.users.length === 0 && <PageMessage>No customers match this page.</PageMessage>}
      {data?.users.length > 0 && (
        <div className="admin-table">
          <table>
            <thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Joined</th></tr></thead>
            <tbody>
              {data.users.map((customer) => (
                <tr key={customer._id}>
                  <td>{customer.name}</td>
                  <td>{customer.email}</td>
                  <td>{dateFormat.format(new Date(customer.createdAt))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pagination data={data} path="/admin/users" params={params} label="Customer pages" />}
    </section>
  )
}

export function AdminDiscounts() {
  const [params, setParams] = useSearchParams()
  const { data, error, loading, retry } = useApi(`/admin/discounts?${params}`)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(null)

  async function create(event) {
    event.preventDefault()
    const form = event.currentTarget
    const values = Object.fromEntries(new FormData(form))
    setSaving(true)
    setNotice(null)
    try {
      await api.post('/admin/discounts', values)
      form.reset()
      setNotice({ message: 'Discount code created.' })
      if ((params.get('page') ?? '1') === '1') retry()
      else setParams({})
    } catch (requestError) {
      setNotice({ error: true, message: errorMessage(requestError, 'We couldn’t create the discount code.') })
    } finally {
      setSaving(false)
    }
  }

  async function disable(discount) {
    if (!window.confirm(`Disable ${discount.code}? Customers will no longer be able to use this code.`)) return
    setSaving(true)
    setNotice(null)
    try {
      await api.patch(`/admin/discounts/${discount._id}/disable`)
      setNotice({ message: 'Discount code disabled.' })
      retry()
    } catch (requestError) {
      setNotice({ error: true, message: errorMessage(requestError, 'We couldn’t disable the discount code.') })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section>
      <div className="page-heading"><h1>Discounts</h1></div>
      <form className="checkout-panel" onSubmit={create}>
        <h2>Create a discount code</h2>
        <fieldset className="account-form" disabled={saving}>
          <label>Code<input name="code" minLength={3} maxLength={24} required /></label>
          <label>Discount (LKR)<input name="amount" inputMode="decimal" placeholder="500.00" maxLength={13} required /></label>
          <label>Minimum item subtotal (LKR)<input name="minimumSubtotal" inputMode="decimal" defaultValue="0" maxLength={13} required /></label>
          <label>Expiry date (Sri Lanka time)<input name="expiry" type="date" required /></label>
          <button type="submit" className="button button-red">Create code</button>
        </fieldset>
      </form>
      {notice && <p className={notice.error ? 'form-error mt-4' : 'mt-4'} role={notice.error ? 'alert' : 'status'}>{notice.message}</p>}
      {loading && <Loading label="Loading discount codes…" />}
      {error && <PageMessage error onRetry={retry}>We couldn’t load discount codes.</PageMessage>}
      {data?.discounts.length === 0 && <PageMessage>No discount codes on this page.</PageMessage>}
      {data?.discounts.length > 0 && (
        <div className="admin-table mt-5">
          <table>
            <thead><tr><th>Code</th><th>Discount</th><th>Minimum subtotal</th><th>Expires</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {data.discounts.map((discount) => {
                const expiry = new Date(discount.expiresAt)
                const active = discount.active && expiry >= new Date()
                return (
                  <tr key={discount._id}>
                    <td>{discount.code}</td>
                    <td>{formatPrice(discount.amount)}</td>
                    <td>{formatPrice(discount.minimumSubtotal)}</td>
                    <td>{expiryFormat.format(expiry)}</td>
                    <td>{active ? 'Active' : discount.active ? 'Expired' : 'Disabled'}</td>
                    <td>{active && <button type="button" className="text-link" disabled={saving} onClick={() => disable(discount)}>Disable</button>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pagination data={data} path="/admin/discounts" params={params} label="Discount pages" />}
    </section>
  )
}
