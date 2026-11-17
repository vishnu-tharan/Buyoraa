import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router'
import { useAuth } from './AuthContext.jsx'
import { Loading, PageMessage } from './components/Feedback.jsx'
import StoreLayout from './components/StoreLayout.jsx'
import { Account, AuthForm } from './pages/Account.jsx'
import Admin, { AdminLayout } from './pages/Admin.jsx'
import Cart from './pages/Cart.jsx'
import { Catalog, ProductDetails } from './pages/Catalog.jsx'
import Home from './pages/Home.jsx'
import Wishlist from './pages/Wishlist.jsx'

function ProtectedRoute({ adminOnly = false }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <Loading label="Checking your account…" />
  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />
  }

  if (adminOnly && user.role !== 'admin') {
    return (
      <PageMessage linkTo="/" linkLabel="Back to the store">
        Administrator access is required.
      </PageMessage>
    )
  }

  return <Outlet />
}

export default function App() {
  return (
    <Routes>
      <Route element={<StoreLayout />}>
        <Route index element={<Home />} />
        <Route path="products" element={<Catalog />} />
        <Route path="products/:id" element={<ProductDetails />} />
        <Route path="cart" element={<Cart />} />
        <Route path="login" element={<AuthForm key="login" />} />
        <Route path="register" element={<AuthForm key="register" registerMode />} />
        <Route element={<ProtectedRoute />}>
          <Route path="account" element={<Account />} />
          <Route path="wishlist" element={<Wishlist />} />
        </Route>
        <Route path="*" element={
          <PageMessage linkTo="/" linkLabel="Back to the store">Page not found.</PageMessage>
        } />
      </Route>
      <Route path="admin" element={<AdminLayout />}>
        <Route element={<ProtectedRoute adminOnly />}>
          <Route index element={<Admin />} />
        </Route>
      </Route>
    </Routes>
  )
}
