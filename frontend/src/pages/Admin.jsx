import { Link, Outlet, useSearchParams } from 'react-router'
import { errorMessage, useApi } from '../api.js'
import { Loading, PageMessage } from '../components/Feedback.jsx'
import { BrandLink } from '../components/StoreLayout.jsx'

const dateFormat = new Intl.DateTimeFormat('en-LK', { dateStyle: 'medium' })

export function AdminLayout() {
  return (
    <div className="shell admin-layout">
      <header className="admin-header">
        <BrandLink />
        <Link to="/account" className="text-link">My account</Link>
      </header>
      <main><Outlet /></main>
    </div>
  )
}

export default function Admin() {
  const [params] = useSearchParams()
  const page = params.get('page') || '1'
  const { data, error, loading, retry } = useApi(`/admin/users?page=${encodeURIComponent(page)}`)

  return (
    <section>
      <div className="page-heading">
        <p>Administration</p>
        <h1>Customers</h1>
      </div>
      {loading && <Loading label="Loading customers…" />}
      {error && <PageMessage error onRetry={retry}>{errorMessage(error, 'We couldn’t load the customers.')}</PageMessage>}
      {data && data.users.length === 0 && <PageMessage>No customers on this page.</PageMessage>}
      {data && data.users.length > 0 && (
        <div className="admin-table">
          <table>
            <thead>
              <tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Joined</th></tr>
            </thead>
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
      {data && (data.page > 1 || data.users.length === data.pageSize) && (
        <nav className="pagination" aria-label="Customer pages">
          {data.page > 1 && <Link to={`/admin?page=${data.page - 1}`} className="button button-outline">Previous</Link>}
          <span>Page {data.page}</span>
          {data.users.length === data.pageSize && data.page < 1000 && (
            <Link to={`/admin?page=${data.page + 1}`} className="button button-outline">Next</Link>
          )}
        </nav>
      )}
    </section>
  )
}
