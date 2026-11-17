import { ChevronLeft, ChevronRight, PackageCheck, PackageX } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { errorMessage, useApi } from '../api.js'
import { Loading, PageMessage } from '../components/Feedback.jsx'
import ProductGrid, { formatPrice, ProductImage } from '../components/ProductGrid.jsx'

function pageLink(params, page) {
  const nextParams = new URLSearchParams(params)
  nextParams.set('page', page)
  return `/products?${nextParams}`
}

export function Catalog() {
  const [params, setParams] = useSearchParams()
  const category = params.get('category') || ''
  const featured = params.get('featured') === 'true'
  const productQuery = params.size ? `?${params}` : ''
  const products = useApi(`/products${productQuery}`)
  const categories = useApi('/categories')

  function changeCategory(event) {
    const nextParams = new URLSearchParams(params)
    nextParams.delete('page')

    if (event.target.value) {
      nextParams.set('category', event.target.value)
    } else {
      nextParams.delete('category')
    }

    setParams(nextParams)
  }

  const { data, error, loading, retry } = products
  const pageCount = data ? Math.min(1000, Math.ceil(data.total / data.pageSize)) : 0
  const categoryList = categories.data?.categories ?? []

  return (
    <section>
      <div className="page-heading">
        <h1>{featured ? 'Featured products' : 'Shop all products'}</h1>
        {data && <p>{data.total} {data.total === 1 ? 'product' : 'products'}</p>}
      </div>

      <div className="catalog-toolbar">
        <label htmlFor="category">Category</label>
        <select id="category" value={category} onChange={changeCategory} disabled={categories.loading}>
          <option value="">All categories</option>
          {category && !categoryList.some(({ slug }) => slug === category) && (
            <option value={category}>{category}</option>
          )}
          {categoryList.map(({ _id, name, slug }) => <option key={_id} value={slug}>{name}</option>)}
        </select>
        {(category || featured) && <Link to="/products" className="text-link">Clear filters</Link>}
        {categories.error && (
          <button type="button" className="text-link" onClick={categories.retry}>Reload categories</button>
        )}
      </div>

      {loading && <Loading label="Loading products…" />}
      {error && <PageMessage error onRetry={retry}>{errorMessage(error, 'We couldn’t load the products.')}</PageMessage>}
      {data && data.products.length === 0 && (
        <PageMessage linkTo={data.page > 1 ? pageLink(params, 1) : undefined} linkLabel="Go to first page">
          No products found.
        </PageMessage>
      )}
      {data && data.products.length > 0 && <ProductGrid products={data.products} />}
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
  const { data, error, loading, retry } = useApi(`/products/${encodeURIComponent(id)}`)

  if (loading) return <Loading label="Loading product…" />
  if (error) {
    const status = error.response?.status
    const missing = status === 400 || status === 404

    return (
      <PageMessage error={!missing} onRetry={missing ? undefined : retry} linkTo="/products" linkLabel="Back to products">
        {missing ? 'Product not found.' : 'We couldn’t load this product.'}
      </PageMessage>
    )
  }

  return <ProductInformation key={data.product._id} product={data.product} />
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

function ProductInformation({ product }) {
  const available = product.stock > 0
  const StockIcon = available ? PackageCheck : PackageX

  return (
    <article>
      <Link to="/products" className="text-link mb-5">
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
        </div>
      </div>
    </article>
  )
}
