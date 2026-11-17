import { useState } from 'react'
import { api, errorMessage, useApi } from '../api.js'
import { Loading, PageMessage } from '../components/Feedback.jsx'

export default function AdminCategories() {
  const { data, error, loading, retry } = useApi('/categories')
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(null)

  async function saveCategory(event) {
    event.preventDefault()
    const form = event.currentTarget
    const fields = Object.fromEntries(new FormData(form))
    setSaving(true)
    setNotice(null)

    try {
      if (editing) await api.put(`/admin/categories/${editing._id}`, fields)
      else await api.post('/admin/categories', fields)
      setNotice({ message: editing ? 'Category updated.' : 'Category added.' })
      setEditing(null)
      form.reset()
      retry()
    } catch (requestError) {
      setNotice({ error: true, message: errorMessage(requestError, 'We couldn’t save the category.') })
    } finally {
      setSaving(false)
    }
  }

  async function removeCategory(category) {
    if (!window.confirm(`Delete "${category.name}"?`)) return
    setSaving(true)
    setNotice(null)

    try {
      await api.delete(`/admin/categories/${category._id}`)
      if (editing?._id === category._id) setEditing(null)
      setNotice({ message: 'Category deleted.' })
      retry()
    } catch (requestError) {
      setNotice({ error: true, message: errorMessage(requestError, 'We couldn’t delete the category.') })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section>
      <div className="page-heading"><h1>Categories</h1></div>
      {notice && <p className={notice.error ? 'form-error mb-4' : 'mb-4'} role={notice.error ? 'alert' : 'status'}>{notice.message}</p>}
      <div className="admin-category-layout">
        <form key={editing?._id ?? 'new'} className="checkout-panel admin-form" onSubmit={saveCategory}>
          <h2>{editing ? 'Edit category' : 'Add category'}</h2>
          <fieldset className="account-form" disabled={saving}>
            <label className="admin-full-field">
              Name
              <input name="name" maxLength={100} defaultValue={editing?.name ?? ''} required />
            </label>
            <label className="admin-full-field">
              Slug
              <input name="slug" maxLength={100} pattern="[a-z0-9]+(?:\x2D[a-z0-9]+)*" defaultValue={editing?.slug ?? ''} placeholder="home-and-living" required />
              <span className="field-hint">Use lowercase letters, numbers, and hyphens.</span>
            </label>
            <label className="admin-full-field">
              Description
              <textarea name="description" maxLength={500} rows={3} defaultValue={editing?.description ?? ''} />
            </label>
          </fieldset>
          <div className="admin-actions">
            <button className="button button-red" type="submit" disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save category' : 'Add category'}
            </button>
            {editing && <button type="button" className="button button-outline" disabled={saving} onClick={() => setEditing(null)}>Cancel</button>}
          </div>
        </form>
        <div className="min-w-0">
          {loading && <Loading label="Loading categories…" />}
          {error && <PageMessage error onRetry={retry}>{errorMessage(error, 'We couldn’t load categories.')}</PageMessage>}
          {data?.categories.length === 0 && <PageMessage>No categories yet.</PageMessage>}
          {data?.categories.length > 0 && (
            <div className="admin-table">
              <table>
                <thead><tr><th scope="col">Category</th><th scope="col">Actions</th></tr></thead>
                <tbody>
                  {data.categories.map((category) => (
                    <tr key={category._id}>
                      <td><strong>{category.name}</strong><p className="text-sm text-stone-600">{category.slug}</p></td>
                      <td><div className="admin-actions">
                        <button type="button" className="text-link" disabled={saving} aria-label={`Edit ${category.name}`} onClick={() => setEditing(category)}>Edit</button>
                        <button type="button" className="text-link" disabled={saving} aria-label={`Delete ${category.name}`} onClick={() => removeCategory(category)}>Delete</button>
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
