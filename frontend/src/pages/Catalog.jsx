import { ChevronLeft, ChevronRight, Heart, PackageCheck, PackageX, Search, ShoppingBag } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router'
import { api, errorMessage, rememberProduct, useApi } from '../api.js'
import { useAuth } from '../AuthContext.jsx'
import { useCart } from '../CartContext.jsx'
import { Loading, PageMessage, Toast } from '../components/Feedback.jsx'
import ProductGrid, { formatPrice, ProductGridSkeleton, ProductImage } from '../components/ProductGrid.jsx'

function pageLink(params, page) {
  const nextParams = new URLSearchParams(params)
  nextParams.set('page', page)
  return `/products?${nextParams}`
}

function CatalogFilters({ params, setParams, categories }) {
  const [error, setError] = useState('')
  const [category, setCategory] = useState(params.get('category') || '')
  const categoryList = categories.data?.categories ?? []

  function applyFilters(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const minimum = form.get('minPrice')
    const maximum = form.get('maxPrice')

    if (minimum && maximum && Number(minimum) > Number(maximum)) {
      setError('The minimum price must be no higher than the maximum price.')
      return
    }

    const nextParams = new URLSearchParams()
    if (params.get('featured') === 'true') nextParams.set('featured', 'true')
    for (const [name, value] of form) {
      if (value.trim() && !(name === 'sort' && value === 'newest')) nextParams.set(name, value.trim())
    }

    setError('')
    setParams(nextParams)
  }

  return (
    <form className="catalog-filters" onSubmit={applyFilters}>
      <label className="filter-search">
        Search by product name
        <input id="search" type="search" name="q" maxLength={100} defaultValue={params.get('q') || ''} placeholder="Search products" />
      </label>
      <label>
        Category
        <select name="category" value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="">All categories</option>
          {category && !categoryList.some(({ slug }) => slug === category) && (
            <option value={category}>{category}</option>
          )}
          {categoryList.map(({ _id, name, slug }) => <option key={_id} value={slug}>{name}</option>)}
        </select>
      </label>
      <label>
        Min price (LKR)
        <input name="minPrice" inputMode="decimal" pattern="[0-9]{1,14}(\.[0-9]{1,2})?" defaultValue={params.get('minPrice') || ''} placeholder="0.00" />
      </label>
      <label>
        Max price (LKR)
        <input name="maxPrice" inputMode="decimal" pattern="[0-9]{1,14}(\.[0-9]{1,2})?" defaultValue={params.get('maxPrice') || ''} placeholder="Any" />
      </label>
      <label>
        Sort by
        <select name="sort" defaultValue={params.get('sort') || 'newest'}>
          <option value="newest">Newest</option>
          <option value="price-asc">Price, low to high</option>
          <option value="price-desc">Price, high to low</option>
        </select>
      </label>
      <div className="filter-actions">
        <label className="inline-flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" name="inStock" value="true" defaultChecked={params.get('inStock') === 'true'} className="size-4 accent-brand-red" />
          In stock only
        </label>
        <button className="button button-red" type="submit"><Search size={17} aria-hidden="true" /> Apply filters</button>
        {params.size > 0 && <Link to="/products" className="text-link">Clear filters</Link>}
        {categories.error && <button type="button" className="text-link" onClick={categories.retry}>Reload categories</button>}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  )
}

export function Catalog() {
  const [params, setParams] = useSearchParams()
  const featured = params.get('featured') === 'true'
  const productQuery = params.size ? `?${params}` : ''
  const products = useApi(`/products${productQuery}`)
  const categories = useApi('/categories')

  const { data, error, loading, retry } = products
  const pageCount = data ? Math.min(1000, Math.ceil(data.total / data.pageSize)) : 0

  return (
    <section>
      <div className="page-heading">
        <h1>{featured ? 'Featured products' : 'Shop all products'}</h1>
        {data && <p>{data.total} {data.total === 1 ? 'product' : 'products'}</p>}
      </div>

      <CatalogFilters key={params.toString()} params={params} setParams={setParams} categories={categories} />

      {loading && <ProductGridSkeleton />}
      {error && <PageMessage error onRetry={retry}>{errorMessage(error, 'We couldn’t load the products.')}</PageMessage>}
      {data && data.products.length === 0 && (
        <PageMessage linkTo={data.page > 1 ? pageLink(params, 1) : undefined} linkLabel="Go to first page">
          No products found.
        </PageMessage>
      )}
      {data && data.products.length > 0 && (
        <ProductGrid products={data.products} linkState={{ catalogReturn: `/products${productQuery}` }} />
      )}
      {data && pageCount > 1 && data.page <= pageCount && (
        <nav className="pagination" aria-label="Product pages">
          {data.page > 1 && (
            <Link className="button button-outline" to={pageLink(params, data.page - 1)}>
              <ChevronLeft size={16} aria-hidden="true" /> Previous
            </Link>
          )}
          <span>Page {data.page} of {pageCount}</span>
          {data.page < pageCount && (
            <Link className="button button-outline" to={pageLink(params, data.page + 1)}>
              Next <ChevronRight size={16} aria-hidden="true" />
            </Link>
          )}
        </nav>
      )}
    </section>
  )
}

export function ProductDetails() {
  const { id } = useParams()
  const { state } = useLocation()
  const savedReturn = state?.catalogReturn
  const catalogReturn = typeof savedReturn === 'string' && /^\/products(?:\?[^#]*)?$/.test(savedReturn)
    ? savedReturn
    : '/products'
  const { data, error, loading, retry } = useApi(`/products/${encodeURIComponent(id)}`)

  if (loading) return <Loading label="Loading product…" />
  if (error) {
    const status = error.response?.status
    const missing = status === 400 || status === 404

    return (
      <PageMessage error={!missing} onRetry={missing ? undefined : retry} linkTo={catalogReturn} linkLabel="Back to products">
        {missing ? 'Product not found.' : 'We couldn’t load this product.'}
      </PageMessage>
    )
  }

  return <ProductInformation key={data.product._id} product={data.product} relatedProducts={data.relatedProducts ?? []} catalogReturn={catalogReturn} />
}

function ProductPhotos({ product }) {
  const [selectedImage, setSelectedImage] = useState(0)

  return (
    <div>
      <ProductImage source={product.images[selectedImage]} alt={product.name} eager />
      {product.images.length > 1 && (
        <div className="product-thumbnails" role="group" aria-label="Product photos">
          {product.images.map((source, index) => (
            <button
              key={`${source}-${index}`}
              type="button"
              aria-label={`View image ${index + 1}`}
              aria-pressed={selectedImage === index}
              onClick={() => setSelectedImage(index)}
            >
              <ProductImage source={source} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ProductInformation({ product, relatedProducts, catalogReturn }) {
  useEffect(() => {
    rememberProduct(product._id)
  }, [product._id])

  const available = product.stock > 0
  const StockIcon = available ? PackageCheck : PackageX

  return (
    <article>
      <Link to={catalogReturn} className="text-link mb-5">
        <ChevronLeft size={17} aria-hidden="true" /> Back to products
      </Link>
      <div className="product-detail">
        <ProductPhotos product={product} />
        <div className="product-detail-copy">
          {product.category && (
            <Link className="text-link" to={`/products?category=${encodeURIComponent(product.category.slug)}`}>
              {product.category.name}
            </Link>
          )}
          <h1>{product.name}</h1>
          <p className="product-price">{formatPrice(product.price)}</p>
          <p className="stock-status">
            <StockIcon size={19} aria-hidden="true" />
            {available ? 'In stock' : 'Out of stock'}
          </p>
          <p className="product-description">{product.description}</p>
          <ProductActions product={product} catalogReturn={catalogReturn} />
        </div>
      </div>
      {relatedProducts.length > 0 && (
        <section className="home-section" aria-labelledby="related-products-heading">
          <div className="section-heading">
            <h2 id="related-products-heading">Related products</h2>
          </div>
          <ProductGrid products={relatedProducts} linkState={{ catalogReturn }} />
        </section>
      )}
    </article>
  )
}

function ProductActions({ product, catalogReturn }) {
  const { user, loading } = useAuth()
  const { addItem } = useCart()
  const [notice, setNotice] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  function addToCart() {
    const message = addItem(product)
    setNotice(message ? { message, error: true } : { message: 'Added to your cart.' })
  }

  async function saveProduct() {
    setSaving(true)
    setNotice(null)
    try {
      await api.put(`/wishlist/${product._id}`)
      setSaved(true)
      setNotice({ message: 'Saved to your wishlist.' })
    } catch (error) {
      setNotice({ error: true, message: errorMessage(error, 'We couldn’t save this product. Try again.') })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-5">
      <div className="flex flex-wrap gap-3">
        {!loading && !user && product.stock > 0 ? (
          <Link to="/login" state={{ from: `/products/${product._id}`, catalogReturn }} className="button button-red">
            <ShoppingBag size={17} aria-hidden="true" /> Sign in to add to cart
          </Link>
        ) : (
          <button type="button" className="button button-red" disabled={loading || product.stock === 0} onClick={addToCart}>
            <ShoppingBag size={17} aria-hidden="true" /> Add to cart
          </button>
        )}
        {!loading && user && (
          <button type="button" className="button button-outline" disabled={saving || saved} onClick={saveProduct}>
            <Heart size={17} aria-hidden="true" /> {saved ? 'Saved to wishlist' : 'Save to wishlist'}
          </button>
        )}
        {!loading && !user && (
          <Link to="/login" state={{ from: `/products/${product._id}`, catalogReturn }} className="button button-outline">
            <Heart size={17} aria-hidden="true" /> Sign in to save
          </Link>
        )}
      </div>
      {notice?.error && <p className="form-error mt-3" role="alert">{notice.message}</p>}
      {notice && !notice.error && <Toast notice={notice} onClose={setNotice} />}
    </div>
  )
}
