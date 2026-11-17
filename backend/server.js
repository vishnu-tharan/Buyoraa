import 'dotenv/config'
import express from 'express'
import mongoose from 'mongoose'

const app = express()
const host = '127.0.0.1'
const port = 5000
const mongoUri = process.env.MONGODB_URI

app.disable('x-powered-by')

app.get('/api/health', async (request, response) => {
  try {
    await mongoose.connection.db.admin().ping()
    response.json({ status: 'ok', database: 'connected' })
  } catch {
    response.status(503).json({ status: 'unavailable', database: 'disconnected' })
  }
})

try {
  if (!mongoUri) {
    throw new Error('MONGODB_URI is missing. Copy .env.example to .env.')
  }

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 })
  app.listen(port, host, async (error) => {
    if (error) {
      console.error(`Could not start the Buyora API on port ${port} (${error.code}).`)
      await mongoose.disconnect()
      process.exitCode = 1
      return
    }

    console.log(`Buyora API is running at http://${host}:${port}`)
  })
} catch (error) {
  const message = mongoUri
    ? `MongoDB connection failed (${error.name}). Check your MONGODB_URI and database server.`
    : error.message

  console.error(message)
  process.exitCode = 1
}
