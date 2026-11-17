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
    .lean()

  response.json({ products: wishlist?.products ?? [] })
})

router.param('productId', (request, response, next, productId) => {
  if (!mongoose.isObjectIdOrHexString(productId)) {
    return response.status(400).json({ message: 'Enter a valid product ID.' })
  }

  next()
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
