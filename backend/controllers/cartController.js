import mongoose from 'mongoose'
import Product, { activeProducts } from '../models/Product.js'
import { DiscountCode, getDeliveryEstimate, readDiscountCode } from '../models/Order.js'

const deliveryFee = 35000

export function validateCartItems(items) {
  if (!Array.isArray(items) || items.length > 50) {
    return { error: 'A cart can contain up to 50 different products.' }
  }

  const productIds = new Set()
  const normalizedItems = []
  for (const item of items) {
    if (typeof item?.productId !== 'string' || !mongoose.isObjectIdOrHexString(item.productId)
      || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) {
      return { error: 'Each cart item needs a valid product and quantity from 1 to 99.' }
    }

    const productId = item.productId.toLowerCase()
    if (productIds.has(productId)) {
      return { error: 'Include each product only once.' }
    }
    productIds.add(productId)
    normalizedItems.push({ productId, quantity: item.quantity })
  }

  return { items: normalizedItems }
}

async function calculateDiscount(code, subtotal, session) {
  if (!code) return { discountAmount: 0 }
  const discount = await DiscountCode.findOne({ code, active: true, expiresAt: { $gte: new Date() } })
    .select('amount minimumSubtotal').session(session).lean()
  if (!discount) return { discountAmount: 0, discountError: 'That discount code is invalid, expired, or disabled.' }
  if (subtotal < discount.minimumSubtotal) {
    const minimum = (discount.minimumSubtotal / 100).toFixed(2)
    return { discountAmount: 0, discountError: `Your item subtotal must be at least LKR ${minimum} to use this code.` }
  }
  if (!subtotal) return { discountAmount: 0, discountError: 'Add an item with a price before using a discount code.' }
  return { discountAmount: Math.min(discount.amount, subtotal), discountCode: code }
}

export async function calculateCart(items, session = null, code = '') {
  const productIds = items.map(({ productId }) => productId)
  const products = await Product.find({ _id: { $in: productIds }, ...activeProducts })
    .select('name price stock images')
    .session(session)
    .lean()
  const byId = new Map(products.map((product) => [String(product._id), product]))
  const lines = items.map(({ productId, quantity }) => {
    const product = byId.get(productId) ?? null
    const available = Boolean(product && product.stock >= quantity)
    return { productId, quantity, product, available, lineTotal: available ? product.price * quantity : 0 }
  })

  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0)
  const shippingFee = lines.some((line) => line.available) ? deliveryFee : 0
  const discount = await calculateDiscount(code, subtotal, session)
  const totalAmount = subtotal - discount.discountAmount + shippingFee

  return {
    lines,
    subtotal,
    shippingFee,
    ...discount,
    totalAmount,
    canCheckout: lines.length > 0 && lines.every((line) => line.available) && !discount.discountError,
  }
}

export async function quoteCart(request, response) {
  const result = validateCartItems(request.body?.items)
  if (result.error) return response.status(400).json({ message: result.error })
  const code = readDiscountCode(request.body.discountCode === undefined ? '' : request.body.discountCode)
  if (code === null) return response.status(400).json({ message: 'Enter a valid discount code.' })

  const quote = await calculateCart(result.items, null, code)
  if (!Number.isSafeInteger(quote.subtotal) || !Number.isSafeInteger(quote.totalAmount)) {
    return response.status(422).json({ message: 'The cart total is too large. Reduce the quantities and try again.' })
  }

  if (request.body.includeDeliveryEstimate === true) quote.deliveryEstimate = await getDeliveryEstimate()
  response.set('Cache-Control', 'no-store').json(quote)
}
