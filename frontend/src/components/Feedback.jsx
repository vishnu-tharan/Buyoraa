import { LoaderCircle } from 'lucide-react'
import { Link } from 'react-router'

export function Loading({ label = 'Loading…' }) {
  return (
    <p className="page-message flex items-center justify-center gap-3" role="status">
      <LoaderCircle size={19} className="text-brand-red motion-safe:animate-spin" aria-hidden="true" />
      {label}
    </p>
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
