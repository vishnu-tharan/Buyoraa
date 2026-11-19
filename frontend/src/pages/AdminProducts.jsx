import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { api, errorMessage, useApi } from '../api.js'
import { Loading, PageMessage, Pagination } from '../components/Feedback.jsx'
import { formatPrice, ProductImage } from '../components/ProductGrid.jsx'

export function AdminProducts() {
  const [params, setParams] = useSearchParams()
  const { state } = useLocation()
  const { data, error, loading, retry } = useApi(`/admin/products?${params}`)
  const lowStock = params.get('lowStock') === 'true'
  const [removing, setRemoving] = useState(false)
  const [notice, setNotice] = useState(null)
  const displayedNotice = notice ?? (state?.message ? { message: state.message } : null)

  function changeStockFilter(event) {
    const nextParams = new URLSearchParams(params)
    nextParams.delete('page')
    if (event.target.checked) nextParams.set('lowStock', 'true')
    else nextParams.delete('lowStock')
    setParams(nextParams)
  }

  async function removeProduct(product) {
    if (!window.confirm(`Remove "${product.name}" from the store?`)) return
    setRemoving(true)
    setNotice(null)

    try {
      await api.delete(`/admin/products/${product._id}`)
      setNotice({ message: 'Product removed from the store.' })
      retry()
    } catch (requestError) {
      setNotice({ error: true, message: errorMessage(requestError, 'We couldn’t remove the product.') })
    } finally {
      setRemoving(false)
    }
  }

  return (
    <section>
      <div className="page-heading admin-page-heading">
        <h1>Products</h1>
        <Link to="/admin/products/new" className="button button-red">Add product</Link>
      </div>
      <label className="mb-4 inline-flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={lowStock} onChange={changeStockFilter} className="size-4 accent-brand-red" />
        Low stock only (1–5 units)
      </label>
      {displayedNotice && (
        <p className={displayedNotice.error ? 'form-error mb-4' : 'mb-4'} role={displayedNotice.error ? 'alert' : 'status'}>{displayedNotice.message}</p>
      )}
      {loading && <Loading label="Loading products…" />}
      {error && <PageMessage error onRetry={retry}>{errorMessage(error, 'We couldn’t load products.')}</PageMessage>}
      {data?.products.length === 0 && (
        <PageMessage>{lowStock ? 'No low-stock products on this page.' : 'No active products on this page.'}</PageMessage>
      )}
      {data?.products.length > 0 && (
        <div className="admin-table">
          <table>
            <thead>
              <tr><th scope="col">Product</th><th scope="col">Category</th><th scope="col">Price</th><th scope="col">Stock</th><th scope="col">Actions</th></tr>
            </thead>
            <tbody>
              {data.products.map((product) => (
                <tr key={product._id}>
                  <td><div className="admin-product-label">
                    <ProductImage source={product.images?.[0]} alt="" />
                    <div>{product.name}{product.featured && <p className="text-sm text-stone-600">Featured</p>}</div>
                  </div></td>
                  <td>{product.category?.name ?? 'No category'}</td>
                  <td>{formatPrice(product.price)}</td>
                  <td>{product.stock}</td>
                  <td><div className="admin-actions">
                    <Link to={`/admin/products/${product._id}`} className="text-link" aria-label={`Edit ${product.name}`}>Edit</Link>
                    <button type="button" className="text-link" aria-label={`Remove ${product.name}`} disabled={removing} onClick={() => removeProduct(product)}>
                      Remove
                    </button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pagination data={data} path="/admin/products" params={params} label="Admin product pages" />}
    </section>
  )
}

function priceInput(price) {
  if (price === undefined) return ''
  return `${Math.floor(price / 100)}.${String(price % 100).padStart(2, '0')}`
}

function ProductEditor({ product, categories, reloadProduct }) {
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState(null)
  const editing = Boolean(product)

  async function save(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const [rupees, cents = ''] = form.get('price').split('.')
    const price = Number(rupees) * 100 + Number(cents.padEnd(2, '0'))
    const stock = Number(form.get('stock'))
    const images = form.get('images').split('\n').map((line) => line.trim()).filter(Boolean)

    if (!Number.isSafeInteger(price) || price < 0 || !Number.isSafeInteger(stock) || stock < 0) {
      setFailure({ message: 'Enter a valid price and stock quantity.' })
      return
    }
    if (!images.length || images.length > 8) {
      setFailure({ message: 'Enter 1 to 8 image URLs, one on each line.' })
      return
    }

    const fields = {
      name: form.get('name'), description: form.get('description'), category: form.get('category'),
      price, stock, images, featured: form.has('featured'),
    }

    setSaving(true)
    setFailure(null)
    try {
      if (editing) {
        await api.put(`/admin/products/${product._id}`, { ...fields, version: product.__v ?? 0 })
      } else {
        await api.post('/admin/products', fields)
      }
      navigate('/admin/products', { state: { message: editing ? 'Product updated.' : 'Product added.' } })
    } catch (error) {
      setFailure({ stale: editing && error.response?.status === 409, message: errorMessage(error, 'We couldn’t save the product.') })
    } finally {
      setSaving(false)
    }
  }

  if (!categories.length) {
    return <PageMessage linkTo="/admin/categories" linkLabel="Add a category">Create a category before saving a product.</PageMessage>
  }

  return (
    <form onSubmit={save} className="checkout-panel admin-form">
      <fieldset className="account-form" disabled={saving}>
        <label>
          Product name
          <input name="name" maxLength={150} defaultValue={product?.name ?? ''} required />
        </label>
        <label>
          Category
          <select name="category" defaultValue={product?.category ?? ''} required>
            <option value="">Select a category</option>
            {categories.map(({ _id, name }) => <option key={_id} value={_id}>{name}</option>)}
          </select>
        </label>
        <label>
          Price (LKR)
          <input name="price" inputMode="decimal" pattern="[0-9]{1,14}(\.[0-9]{1,2})?" defaultValue={priceInput(product?.price)} required />
        </label>
        <label>
          Stock quantity
          <input name="stock" inputMode="numeric" pattern="[0-9]{1,16}" defaultValue={product?.stock ?? 0} required />
        </label>
        <label className="admin-full-field">
          Description
          <textarea name="description" rows={4} maxLength={5000} defaultValue={product?.description ?? ''} required />
        </label>
        <label className="admin-full-field">
          Image URLs
          <textarea name="images" rows={3} defaultValue={product?.images?.join('\n') ?? ''} placeholder="https://example.com/product.jpg" required />
          <span className="field-hint">Enter one HTTP or HTTPS URL per line.</span>
        </label>
        <label className="admin-checkbox">
          <input type="checkbox" name="featured" defaultChecked={product?.featured ?? false} />
          Feature on homepage
        </label>
      </fieldset>
      {failure && <p className="form-error" role="alert">{failure.message}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="submit" className="button button-red" disabled={saving || failure?.stale}>
          {saving ? 'Saving…' : editing ? 'Save product' : 'Add product'}
        </button>
        {failure?.stale && <button type="button" className="button button-outline" onClick={reloadProduct}>Reload product</button>}
        <Link to="/admin/products" className="button button-outline">Back to products</Link>
      </div>
    </form>
  )
}

function EditProduct({ id, categories }) {
  const { data, error, loading, retry } = useApi(`/admin/products/${encodeURIComponent(id)}`)

  if (loading) return <Loading label="Loading product…" />
  if (error) return <PageMessage error onRetry={retry}>{errorMessage(error, 'We couldn’t load the product.')}</PageMessage>

  return <ProductEditor key={id} product={data.product} categories={categories} reloadProduct={retry} />
}

export function AdminProductForm() {
  const { id } = useParams()
  const { data, error, loading, retry } = useApi('/categories')

  return (
    <section>
      <div className="page-heading"><h1>{id ? 'Edit product' : 'Add product'}</h1></div>
      {loading && <Loading label="Loading categories…" />}
      {error && <PageMessage error onRetry={retry}>{errorMessage(error, 'We couldn’t load categories.')}</PageMessage>}
      {data && (id
        ? <EditProduct key={id} id={id} categories={data.categories} />
        : <ProductEditor categories={data.categories} />)}
    </section>
  )
}
