import { ImageIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

const currency = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' })

export function formatPrice(price) {
  return currency.format(price / 100)
}

export function ProductImage({ source, alt, eager = false }) {
  const [failedSource, setFailedSource] = useState(null)

  if (!source || source === failedSource) {
    return (
      <div className="product-image product-image-empty" role="img" aria-label={alt || 'Product image unavailable'}>
        <ImageIcon size={28} aria-hidden="true" />
      </div>
    )
  }

  return (
    <img
      className="product-image"
      src={source}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      onError={() => setFailedSource(source)}
    />
  )
}

function ProductCard({ product, linkState }) {
  return (
    <Link to={`/products/${product._id}`} state={linkState} className="product-card relative">
      <ProductImage source={product.images[0]} alt="" />
      {product.stock === 0 && (
        <span className="absolute top-2 left-2 rounded-full bg-brand-dark-red px-2.5 py-1 text-xs font-bold text-white">
          Sold out
        </span>
      )}
      <div className="product-card-info">
        <p className="text-sm text-stone-600">{product.category?.name}</p>
        <h3 className="mt-1 font-semibold">{product.name}</h3>
        <p className="mt-2 font-bold text-brand-red">{formatPrice(product.price)}</p>
      </div>
    </Link>
  )
}

export default function ProductGrid({ products, linkState }) {
  return (
    <div className="product-grid">
      {products.map((product) => <ProductCard key={product._id} product={product} linkState={linkState} />)}
    </div>
  )
}

export function ProductGridSkeleton() {
  return (
    <div role="status">
      <span className="sr-only">Loading products…</span>
      <div className="product-grid" aria-hidden="true">
        {[1, 2, 3, 4].map((item) => (
          <div className="product-card motion-safe:animate-pulse" key={item}>
            <div className="product-image" />
            <div className="product-card-info product-skeleton-lines"><span /><span /></div>
          </div>
        ))}
      </div>
    </div>
  )
}
