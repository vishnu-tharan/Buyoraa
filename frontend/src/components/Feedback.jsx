import { CircleCheck, LoaderCircle, X } from 'lucide-react'
import { useEffect } from 'react'
import { Link } from 'react-router'

export function Loading({ label = 'Loading…' }) {
  return (
    <p className="page-message flex items-center justify-center gap-3" role="status">
      <LoaderCircle size={19} className="text-brand-red motion-safe:animate-spin" aria-hidden="true" />
      {label}
    </p>
  )
}

export function Toast({ notice, onClose }) {
  useEffect(() => {
    const timer = setTimeout(() => onClose(null), 5000)
    return () => clearTimeout(timer)
  }, [notice, onClose])

  return (
    <div className="store-toast">
      <p role="status"><CircleCheck size={19} aria-hidden="true" /> {notice.message}</p>
      <button type="button" aria-label="Dismiss message" onClick={() => onClose(null)}><X size={18} aria-hidden="true" /></button>
    </div>
  )
}

export function PageMessage({ children, error = false, onRetry, linkTo, linkLabel }) {
  return (
    <div className="page-message" role={error ? 'alert' : undefined}>
      <p>{children}</p>
      {onRetry && <button type="button" onClick={onRetry} className="button button-outline mt-4">Try again</button>}
      {linkTo && <Link to={linkTo} className="button button-outline mt-4">{linkLabel}</Link>}
    </div>
  )
}

export function Pagination({ data, path, params, label }) {
  const pages = Math.min(1000, Math.ceil(data.total / data.pageSize))
  if (pages <= 1 && data.page <= 1) return null

  function pageLink(page) {
    const next = new URLSearchParams(params)
    next.set('page', page)
    return `${path}?${next}`
  }

  return (
    <nav className="pagination" aria-label={label}>
      {data.page > 1 && <Link to={pageLink(Math.min(data.page - 1, Math.max(pages, 1)))} className="button button-outline">Previous</Link>}
      <span>Page {data.page}</span>
      {data.page < pages && <Link to={pageLink(data.page + 1)} className="button button-outline">Next</Link>}
    </nav>
  )
}
