import { ClipboardList, LayoutDashboard, Package, Tags, UsersRound } from 'lucide-react'
import { Link, NavLink, Outlet, useSearchParams } from 'react-router'
import { errorMessage, useApi } from '../api.js'
import { Loading, PageMessage, Pagination } from '../components/Feedback.jsx'
import { formatPrice } from '../components/ProductGrid.jsx'
import { BrandLink, StoreSearch } from '../components/StoreLayout.jsx'
import { AdminOrdersTable } from './AdminOrders.jsx'

const dateFormat = new Intl.DateTimeFormat('en-LK', { dateStyle: 'medium' })
const salesDayFormat = new Intl.DateTimeFormat('en-LK', { weekday: 'short', timeZone: 'Asia/Colombo' })
const compactSales = new Intl.NumberFormat('en-LK', { notation: 'compact', maximumFractionDigits: 1 })

const adminLinks = [
  { path: '/admin', label: 'Overview', Icon: LayoutDashboard },
  { path: '/admin/products', label: 'Products', Icon: Package },
  { path: '/admin/categories', label: 'Categories', Icon: Tags },
  { path: '/admin/orders', label: 'Orders', Icon: ClipboardList },
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
