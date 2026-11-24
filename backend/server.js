import 'dotenv/config'
import { existsSync } from 'node:fs'
import { extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import cookieParser from 'cookie-parser'
import express from 'express'
import mongoose from 'mongoose'
import { connectDatabase } from './config/database.js'
import { quoteCart } from './controllers/cartController.js'
import { handleError } from './middleware/errors.js'
import adminRoutes from './routes/adminRoutes.js'
import authRoutes from './routes/authRoutes.js'
import catalogRoutes from './routes/catalogRoutes.js'
import orderRoutes from './routes/orderRoutes.js'
import userRoutes from './routes/userRoutes.js'
import wishlistRoutes from './routes/wishlistRoutes.js'

const app = express()
const production = process.env.NODE_ENV === 'production'
const host = process.env.HOST || (production ? '0.0.0.0' : '127.0.0.1')
const port = Number(process.env.PORT || 5000)
const mongoUri = process.env.MONGODB_URI
const frontendOrigin = process.env.FRONTEND_ORIGIN || (production ? '' : 'http://127.0.0.1:5173')
const frontendBuild = fileURLToPath(new URL('../frontend/dist/', import.meta.url))
const frontendIndex = fileURLToPath(new URL('../frontend/dist/index.html', import.meta.url))

app.disable('x-powered-by')
const trustProxy = process.env.TRUST_PROXY?.trim()
if (trustProxy) app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy)

app.use((request, response, next) => {
  response.set('X-Frame-Options', 'DENY')
  response.set('X-Content-Type-Options', 'nosniff')
  response.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  next()
})

// Browser requests use Vite's same-origin proxy during development.
app.use('/api', (request, response, next) => {
  const origin = request.get('Origin')
  const readOnly = ['GET', 'HEAD', 'OPTIONS'].includes(request.method)

  if (!readOnly && origin && origin !== frontendOrigin) {
    return response.status(403).json({ message: 'This request origin is not allowed.' })
  }

  next()
})

app.use('/api/admin', express.json({ limit: '80kb' }))
app.use(express.json({ limit: '16kb' }))
app.use(cookieParser())

app.get('/api/health', async (request, response) => {
  try {
    await mongoose.connection.db.admin().ping()
    response.json({ status: 'ok', database: 'connected' })
  } catch {
    response.status(503).json({ status: 'unavailable', database: 'disconnected' })
  }
})

app.use('/api/auth', authRoutes)
app.use('/api/admin', adminRoutes)
app.post('/api/cart/quote', quoteCart)
app.use('/api/orders', orderRoutes)
app.use('/api/users', userRoutes)
app.use('/api/wishlist', wishlistRoutes)
app.use('/api', catalogRoutes)

function routeNotFound(request, response) {
  response.status(404).json({ message: 'Route not found.' })
}

app.use('/api', routeNotFound)

if (production) {
  app.use(express.static(frontendBuild, { index: false }))
  app.get('/{*path}', (request, response, next) => {
    if (extname(request.path) || !request.accepts('html')) return next()
    response.set('Cache-Control', 'no-cache').sendFile(frontendIndex)
  })
}

app.use(routeNotFound)
app.use(handleError)

async function start() {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error('Set PORT to a whole number between 1 and 65535.')
    process.exitCode = 1
    return
  }

  if (production) {
    const origin = URL.parse(frontendOrigin)
    if (origin?.protocol !== 'https:' || origin.origin !== frontendOrigin) {
      console.error('Set FRONTEND_ORIGIN to the exact public HTTPS origin, without a trailing slash.')
      process.exitCode = 1
      return
    }
    if (!existsSync(frontendIndex)) {
      console.error('Build the frontend before starting Buyora in production.')
      process.exitCode = 1
      return
    }
  }

  if (!mongoUri) {
    console.error('MONGODB_URI is missing. Copy .env.example to .env.')
    process.exitCode = 1
    return
  }

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.trim().length < 32) {
    console.error('Set JWT_SECRET to a random value of at least 32 characters.')
    process.exitCode = 1
    return
  }

  try {
    await connectDatabase(mongoUri)
  } catch (error) {
    console.error(`MongoDB setup failed (${error.name}). Check your MongoDB connection and indexes.`)
    await mongoose.disconnect()
    process.exitCode = 1
    return
  }

  app.listen(port, host, async (error) => {
    if (error) {
      console.error(`Could not start the Buyora API on port ${port} (${error.code}).`)
      await mongoose.disconnect()
      process.exitCode = 1
      return
    }

    console.log(`Buyora API is running at http://${host}:${port}`)
  })
}

await start()
