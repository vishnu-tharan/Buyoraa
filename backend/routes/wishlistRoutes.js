import { Router } from 'express'
import mongoose from 'mongoose'
import { requireUser } from '../middleware/auth.js'
import Product, { activeProducts } from '../models/Product.js'
import Wishlist from '../models/Wishlist.js'

const router = Router()

router.use(requireUser)

router.get('/', async (request, response) => {
  const wishlist = await Wishlist.findOne({ user: request.user.id })
    .populate({ path: 'products', select: 'name price stock images', match: activeProducts })
    .populate({ path: 'stockAlerts', select: 'name stock archived' })
    .lean()

  response.json({ products: wishlist?.products ?? [], stockAlerts: wishlist?.stockAlerts ?? [] })
})

router.param('productId', (request, response, next, productId) => {
  if (!mongoose.isObjectIdOrHexString(productId)) {
    return response.status(400).json({ message: 'Enter a valid product ID.' })
  }

  next()
})

router.get('/:productId', async (request, response) => {
  const saved = await Wishlist.exists({ user: request.user.id, products: request.params.productId })
  response.json({ saved: Boolean(saved) })
})

async function ensureWishlist(owner) {
  try {
    await Wishlist.updateOne(owner, { $setOnInsert: owner }, { upsert: true, timestamps: false })
  } catch (error) {
    if (error.code !== 11000) throw error
  }
}

router.put('/stock-alerts/:productId', async (request, response) => {
  const productId = request.params.productId
  const owner = { user: request.user.id }
  if (await Wishlist.exists({ ...owner, stockAlerts: productId })) return response.sendStatus(204)
  const product = await Product.findOne({ _id: productId, ...activeProducts }).select('stock').lean()
  if (!product) return response.status(404).json({ message: 'Product not found.' })
  if (product.stock > 0) return response.status(409).json({ message: 'This product is already in stock. Reload the page to see its availability.' })

  await ensureWishlist(owner)
  const result = await Wishlist.updateOne({
    ...owner,
    $or: [{ stockAlerts: productId }, { 'stockAlerts.49': { $exists: false } }],
  }, { $addToSet: { stockAlerts: productId } })
  if (result.matchedCount) return response.sendStatus(204)
  response.status(409).json({ message: 'You can follow up to 50 products. Remove an alert from your wishlist first.' })
})

router.delete('/stock-alerts/:productId', async (request, response) => {
  await Wishlist.updateOne({ user: request.user.id }, { $pull: { stockAlerts: request.params.productId } })
  response.sendStatus(204)
})

router.put('/:productId', async (request, response) => {
  const { productId } = request.params
  if (!(await Product.exists({ _id: productId, ...activeProducts }))) {
    return response.status(404).json({ message: 'Product not found.' })
  }

  const owner = { user: request.user.id }
  const update = { $addToSet: { products: productId } }

  try {
    await Wishlist.updateOne(owner, update, { upsert: true })
  } catch (error) {
    if (error.code !== 11000) throw error
    await Wishlist.updateOne(owner, update)
  }

  response.sendStatus(204)
})

router.delete('/:productId', async (request, response) => {
  await Wishlist.updateOne(
    { user: request.user.id },
    { $pull: { products: request.params.productId } },
  )
  response.sendStatus(204)
})

export default router
