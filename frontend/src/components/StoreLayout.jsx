import { ShoppingBag, UserRound } from 'lucide-react'
import { useEffect } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { useAuth } from '../AuthContext.jsx'

export function BrandLink() {
  return (
    <Link to="/" className="brand-link" aria-label="Buyora home">
      <span className="brand-icon"><ShoppingBag size={19} aria-hidden="true" /></span>
      Buyora
    </Link>
  )
}

function Navbar() {
  const { user, loading } = useAuth()
  const navClass = ({ isActive }) => isActive ? 'nav-link nav-link-active' : 'nav-link'

  return (
    <header className="store-header">
      <nav aria-label="Main navigation" className="store-nav shell">
        <BrandLink />
        <div className="nav-pages">
          <NavLink end to="/" className={navClass}>Home</NavLink>
          <NavLink to="/products" className={navClass}>Shop</NavLink>
          <Link to="/#categories" className="nav-link">Categories</Link>
        </div>
        <Link to={user ? '/account' : '/login'} className="account-link">
          <UserRound size={17} aria-hidden="true" />
          {loading || user ? 'Account' : 'Sign in'}
        </Link>
      </nav>
    </header>
  )
}

function Footer() {
  return (
    <footer className="store-footer">
      <div className="shell footer-content">
        <div>
          <BrandLink />
          <p className="mt-3 text-sm text-stone-600">Discover More. Shop Better.</p>
        </div>
        <nav className="footer-links" aria-label="Footer navigation">
          <Link to="/products">Shop all products</Link>
          <Link to="/account">My account</Link>
        </nav>
      </div>
    </footer>
  )
}

export default function StoreLayout() {
  const location = useLocation()

  useEffect(() => {
    if (location.hash === '#categories') {
      document.getElementById('categories')?.scrollIntoView()
    } else {
      window.scrollTo(0, 0)
    }
  }, [location])

  return (
    <div className="store-layout">
      <Navbar />
      <main className="shell store-main">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
