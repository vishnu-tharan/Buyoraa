import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router'
import { SessionError, useAuth } from './AuthContext.jsx'
import { Loading, PageMessage } from './components/Feedback.jsx'
import StoreLayout from './components/StoreLayout.jsx'
import { Account, AuthForm } from './pages/Account.jsx'
import AdminOverview, { AdminLayout, AdminUsers } from './pages/Admin.jsx'
import AdminCategories from './pages/AdminCategories.jsx'
import { AdminOrderDetails, AdminOrders } from './pages/AdminOrders.jsx'
import { AdminProductForm, AdminProducts } from './pages/AdminProducts.jsx'
import Cart from './pages/Cart.jsx'
import { Catalog, ProductDetails } from './pages/Catalog.jsx'
import Checkout from './pages/Checkout.jsx'
import Home from './pages/Home.jsx'
import { OrderDetails, OrderSuccess, Orders } from './pages/Orders.jsx'
import Wishlist from './pages/Wishlist.jsx'

function ProtectedRoute({ adminOnly = false }) {
  const { user, loading, sessionError } = useAuth()
  const location = useLocation()

  if (loading) return <Loading label="Checking your account…" />
  if (sessionError) return <SessionError />
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
          <Route path="checkout" element={<Checkout />} />
          <Route path="orders" element={<Orders />} />
          <Route path="orders/:id" element={<OrderDetails />} />
          <Route path="orders/:id/success" element={<OrderSuccess />} />
        </Route>
        <Route path="*" element={
          <PageMessage linkTo="/" linkLabel="Back to the store">Page not found.</PageMessage>
        } />
      </Route>
      <Route element={<ProtectedRoute adminOnly />}>
        <Route path="admin" element={<AdminLayout />}>
          <Route index element={<AdminOverview />} />
          <Route path="products" element={<AdminProducts />} />
          <Route path="products/new" element={<AdminProductForm />} />
          <Route path="products/:id" element={<AdminProductForm />} />
          <Route path="categories" element={<AdminCategories />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="orders/:id" element={<AdminOrderDetails />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="*" element={<PageMessage linkTo="/admin" linkLabel="Back to overview">Admin page not found.</PageMessage>} />
        </Route>
      </Route>
    </Routes>
  )
}
