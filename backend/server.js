import 'dotenv/config'
import cookieParser from 'cookie-parser'
import express from 'express'
import mongoose from 'mongoose'
import { connectDatabase } from './config/database.js'
import { handleError } from './middleware/errors.js'
import adminRoutes from './routes/adminRoutes.js'
import authRoutes from './routes/authRoutes.js'
import catalogRoutes from './routes/catalogRoutes.js'

const app = express()
const host = '127.0.0.1'
const port = 5000
const mongoUri = process.env.MONGODB_URI
const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:5173'

app.disable('x-powered-by')

// Browser requests use Vite's same-origin proxy during development.
app.use('/api', (request, response, next) => {
  const origin = request.get('Origin')
  const readOnly = ['GET', 'HEAD', 'OPTIONS'].includes(request.method)

  if (!readOnly && origin && origin !== frontendOrigin) {
    return response.status(403).json({ message: 'This request origin is not allowed.' })
  }

  next()
})

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
app.use('/api', catalogRoutes)

app.use((request, response) => {
  response.status(404).json({ message: 'Route not found.' })
})
app.use(handleError)

async function start() {
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
