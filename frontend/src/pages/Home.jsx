import { ArrowDownRight, ArrowRight, ShoppingBag } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { readRecentProducts, useApi } from '../api.js'
import { useAuth } from '../AuthContext.jsx'
import { Loading, PageMessage } from '../components/Feedback.jsx'
import ProductGrid, { ProductGridSkeleton } from '../components/ProductGrid.jsx'

const heroImage = 'https://images.unsplash.com/photo-1760565030282-8fb986077e0d?auto=format&fit=crop&w=1200&q=82'

function CategoryLinks() {
  const { data, error, loading, retry } = useApi('/categories')

  if (loading) return <Loading label="Loading categories…" />
  if (error) return <PageMessage error onRetry={retry}>We couldn’t load the categories.</PageMessage>
  if (!data.categories.length) return <PageMessage>No categories are available yet.</PageMessage>

  return (
    <div className="category-grid">
      {data.categories.map(({ _id, name, slug }) => (
        <Link key={_id} to={`/products?category=${encodeURIComponent(slug)}`} className="category-link">
          {name}
          <ArrowRight size={17} aria-hidden="true" />
        </Link>
      ))}
    </div>
  )
}

function ProductShelf({ title, endpoint, emptyMessage }) {
  const { data, error, loading, retry } = useApi(endpoint)
  const products = data?.products ?? []

  if (data && !products.length && !emptyMessage) return null

  return (
    <section className="home-section">
      <div className="section-heading">
        <h2>{title}</h2>
        <Link to={endpoint} className="text-link">View all <ArrowRight size={16} aria-hidden="true" /></Link>
      </div>
      {loading && <ProductGridSkeleton />}
      {error && <PageMessage error onRetry={retry}>We couldn’t load these products.</PageMessage>}
      {data && products.length === 0 && <PageMessage>{emptyMessage}</PageMessage>}
      {products.length > 0 && <ProductGrid products={products.slice(0, 4)} />}
    </section>
  )
}

function RecentProducts({ productIds }) {
  const { data, loading, error, retry } = useApi(`/products/recent?ids=${productIds.join(',')}`)
  if (data?.products.length === 0) return null

  return (
    <section className="home-section" aria-labelledby="recent-products-heading">
      <div className="section-heading"><h2 id="recent-products-heading">Recently viewed</h2></div>
      {loading && <ProductGridSkeleton />}
      {error && <PageMessage error onRetry={retry}>We couldn’t load your recently viewed products.</PageMessage>}
      {data && <ProductGrid products={data.products} />}
    </section>
  )
}

export default function Home() {
  const { user, loading } = useAuth()
  const [recentProducts] = useState(readRecentProducts)

  return (
    <>
      <section className="store-hero">
        <div className="hero-copy">
          <h1>Discover More.<br /><span>Shop Better.</span></h1>
          <p>Explore the latest finds and shop by category.</p>
          <Link to="/products" className="button button-yellow">
            Shop the catalog <ArrowRight size={19} aria-hidden="true" />
          </Link>
        </div>
        <div className="hero-media">
          <ShoppingBag size={96} strokeWidth={1.2} aria-hidden="true" />
          <img
            src={heroImage}
            alt="A hand holding colorful paper shopping bags"
            fetchPriority="high"
            onError={(event) => { event.currentTarget.hidden = true }}
          />
        </div>
      </section>

      <section id="categories" className="home-section">
        <div className="section-heading"><h2>Shop by category</h2></div>
        <CategoryLinks />
      </section>

      <ProductShelf title="Featured products" endpoint="/products?featured=true" />
      <ProductShelf title="New arrivals" endpoint="/products" emptyMessage="New products will appear here when they’re available." />
      {recentProducts.length > 0 && <RecentProducts productIds={recentProducts} />}

      {!user && !loading && (
        <section className="store-promo">
          <div>
            <h2>Create your Buyora account</h2>
            <p>Keep your details in one place for future visits.</p>
          </div>
          <Link to="/register" className="button button-red">
            Create an account <ArrowDownRight size={18} aria-hidden="true" />
          </Link>
        </section>
      )}
    </>
  )
}
