import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import axios from 'axios'
import { ArrowRight, ShoppingBag } from 'lucide-react'
import './index.css'

function App() {
  const [connectionStatus, setConnectionStatus] = useState('idle')

  async function checkConnection() {
    setConnectionStatus('loading')

    try {
      const response = await axios.get('/api/health', { timeout: 7000 })
      const isConnected = response.data.database === 'connected'
      setConnectionStatus(isConnected ? 'connected' : 'unavailable')
    } catch {
      setConnectionStatus('unavailable')
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-brand-line bg-white">
        <nav aria-label="Main navigation" className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <a href="/" className="inline-flex items-center gap-2.5 text-2xl font-bold tracking-tight text-brand-red">
            <span className="grid size-9 place-items-center rounded-xl bg-brand-red text-white">
              <ShoppingBag size={19} aria-hidden="true" />
            </span>
            Buyora
          </a>
          <a href="#connection" className="text-sm font-semibold hover:text-brand-red">
            Setup status
          </a>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 sm:px-8 sm:py-14">
        <section className="grid items-center gap-8 rounded-3xl bg-brand-red px-7 py-10 text-white sm:p-14 md:grid-cols-[1.25fr_1fr]">
          <div>
            <h1 className="text-5xl leading-none font-bold tracking-tight sm:text-7xl">
              Discover More. <span className="block text-brand-yellow">Shop Better.</span>
            </h1>
            <a href="#connection" className="mt-7 inline-flex items-center gap-2 rounded-full bg-brand-yellow px-5 py-3 font-semibold text-brand-ink hover:bg-white">
              Check local setup
              <ArrowRight size={18} aria-hidden="true" />
            </a>
          </div>
          <div aria-hidden="true" className="grid h-40 place-items-center rounded-3xl bg-brand-yellow text-brand-red md:h-64">
            <ShoppingBag size={96} strokeWidth={1.4} className="-rotate-12" />
          </div>
        </section>

        <section id="connection" className="mt-6 scroll-mt-6 rounded-2xl border border-brand-line bg-white p-6 sm:p-8">
          <h2 className="text-2xl font-bold tracking-tight">Store connection</h2>
          <p className="mt-2 text-stone-600">Check that the Buyora API can reach MongoDB.</p>
          <button
            type="button"
            onClick={checkConnection}
            disabled={connectionStatus === 'loading'}
            className="mt-5 rounded-full bg-brand-red px-5 py-3 font-semibold text-white hover:bg-brand-dark-red disabled:opacity-75"
          >
            Check connection
          </button>
          <p role="status" className="mt-3 text-sm">
            {connectionStatus === 'loading' && 'Checking the connection…'}
            {connectionStatus === 'connected' && 'The Buyora API and MongoDB are connected.'}
            {connectionStatus === 'unavailable' && 'Connection unavailable. Check that the API and MongoDB are running.'}
          </p>
        </section>
      </main>

      <footer className="border-t border-brand-line px-5 py-5 text-center text-sm text-stone-600">
        Buyora
      </footer>
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)
