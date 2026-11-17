import mongoose from 'mongoose'
import Product from '../models/Product.js'

const deliveryFee = 35000

export async function quoteCart(request, response) {
  const { items } = request.body ?? {}

  if (!Array.isArray(items) || items.length > 50) {
    return response.status(400).json({ message: 'A cart can contain up to 50 different products.' })
  }

  const productIds = new Set()
  for (const item of items) {
    if (typeof item?.productId !== 'string' || !mongoose.isObjectIdOrHexString(item.productId)
      || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) {
      return response.status(400).json({ message: 'Each cart item needs a valid product and quantity from 1 to 99.' })
    }

    const productId = item.productId.toLowerCase()
    if (productIds.has(productId)) {
      return response.status(400).json({ message: 'Include each product only once.' })
    }
    productIds.add(productId)
  }

  const products = await Product.find({ _id: { $in: [...productIds] } }).select('name price stock images').lean()
  const byId = new Map(products.map((product) => [String(product._id), product]))
  const lines = items.map(({ productId, quantity }) => {
    const product = byId.get(productId.toLowerCase()) ?? null
    const available = Boolean(product && product.stock >= quantity)
    return { productId, quantity, product, available, lineTotal: available ? product.price * quantity : 0 }
  })

  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0)
  const shippingFee = lines.some((line) => line.available) ? deliveryFee : 0
  const totalAmount = subtotal + shippingFee

  if (!Number.isSafeInteger(totalAmount)) {
    return response.status(422).json({ message: 'The cart total is too large. Reduce the quantities and try again.' })
  }

  response.set('Cache-Control', 'no-store').json({
    lines,
    subtotal,
    shippingFee,
    totalAmount,
    canCheckout: lines.length > 0 && lines.every((line) => line.available),
  })
}
