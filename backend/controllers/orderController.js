import { createHash } from 'node:crypto'
import mongoose from 'mongoose'
import Order from '../models/Order.js'
import Product from '../models/Product.js'
import { readAddress, readPhone } from '../utils/address.js'
import { calculateCart, validateCartItems } from './cartController.js'

const checkoutKeyPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/
const stockChanged = new Error('Stock changed during checkout.')

function findAttempt(user, checkoutKey, session = null) {
  return Order.findOne({ user, checkoutKey })
    .select('orderItems +checkoutFingerprint')
    .session(session)
    .lean()
}

function orderReceipt(order) {
  return {
    orderId: order._id,
    items: order.orderItems.map(({ product, quantity }) => ({ productId: product, quantity })),
  }
}

export async function checkoutAttempt(request, response) {
  const { checkoutKey } = request.params
  if (!checkoutKeyPattern.test(checkoutKey)) {
    return response.status(400).json({ message: 'Enter a valid checkout key.' })
  }

  const order = await findAttempt(request.user.id, checkoutKey)
  response.json({ receipt: order ? orderReceipt(order) : null })
}

export async function placeOrder(request, response) {
  const { items, shippingAddress, expectedTotal, checkoutKey } = request.body ?? {}
  const cart = validateCartItems(items)
  if (cart.error || !cart.items.length) {
    return response.status(400).json({ message: cart.error || 'Your cart is empty.' })
  }
  if (typeof checkoutKey !== 'string' || !checkoutKeyPattern.test(checkoutKey)
    || !Number.isSafeInteger(expectedTotal) || expectedTotal < 0) {
    return response.status(400).json({ message: 'Review your checkout details and try again.' })
  }

  const address = readAddress(shippingAddress)
  const name = typeof shippingAddress?.name === 'string' ? shippingAddress.name.trim() : ''
  const phone = readPhone(shippingAddress?.phone)
  if (!address || !name || name.length > 100 || !phone) {
    return response.status(400).json({ message: 'Enter a complete delivery address and a valid contact number.' })
  }

  const delivery = { ...address, name, phone }
  const sortedItems = cart.items.toSorted((first, second) => first.productId.localeCompare(second.productId))
  const checkoutFingerprint = createHash('sha256')
    .update(JSON.stringify({ items: sortedItems, delivery }))
    .digest('hex')
  const user = request.user.id

  let result
  try {
    result = await mongoose.connection.transaction(async (session) => {
      const previousOrder = await findAttempt(user, checkoutKey, session)
      if (previousOrder) return { order: previousOrder }

      const quote = await calculateCart(sortedItems, session)
      if (!quote.canCheckout) return { message: 'Stock has changed. Review the quantities in your cart.' }
      if (quote.totalAmount !== expectedTotal) return { message: 'The total has changed. Review the updated price before placing your order.' }

      const orderItems = []
      for (const { product, quantity } of quote.lines) {
        const updated = await Product.updateOne(
          { _id: product._id, stock: { $gte: quantity } },
          { $inc: { stock: -quantity } },
          { session },
        )
        if (updated.modifiedCount !== 1) throw stockChanged

        orderItems.push({ product: product._id, name: product.name, price: product.price, quantity })
      }

      const [order] = await Order.create([{
        user, orderItems, shippingAddress: delivery, checkoutKey, checkoutFingerprint,
        subtotal: quote.subtotal, shippingFee: quote.shippingFee, totalAmount: quote.totalAmount,
      }], { session })

      return { order, created: true }
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } })
  } catch (error) {
    if (error === stockChanged) {
      return response.status(409).json({ message: 'Stock has changed. Review the quantities in your cart.' })
    }
    if (error.code === 20) {
      return response.status(503).json({ message: 'Checkout needs a MongoDB replica set. Please try again later.' })
    }
    if (error.code !== 11000) throw error

    const previousOrder = await findAttempt(user, checkoutKey)
    if (!previousOrder) throw error
    result = { order: previousOrder }
  }

  if (result.message) return response.status(409).json({ message: result.message })
  if (!result.created && result.order.checkoutFingerprint !== checkoutFingerprint) {
    return response.status(409).json({
      message: 'This checkout already placed an order. Review your order before trying again.',
      orderId: result.order._id,
    })
  }

  response.status(result.created ? 201 : 200).json({ receipt: orderReceipt(result.order) })
}

export async function listOrders(request, response) {
  const { page = '1' } = request.query
  const pageNumber = Number(page)
  const pageSize = 20

  if (typeof page !== 'string' || !/^\d+$/.test(page) || pageNumber < 1 || pageNumber > 1000) {
    return response.status(400).json({ message: 'Page must be a whole number between 1 and 1000.' })
  }

  const filter = { user: request.user.id }
  const [orders, total] = await Promise.all([
    Order.find(filter)
      .select('createdAt orderStatus paymentStatus totalAmount orderItems')
      .sort({ createdAt: -1, _id: -1 })
      .skip((pageNumber - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    Order.countDocuments(filter),
  ])
  response.json({ orders, page: pageNumber, pageSize, total })
}

export async function orderDetails(request, response) {
  if (!mongoose.isObjectIdOrHexString(request.params.id)) {
    return response.status(400).json({ message: 'Enter a valid order ID.' })
  }

  const order = await Order.findOne({ _id: request.params.id, user: request.user.id }).lean()
  if (!order) return response.status(404).json({ message: 'Order not found.' })
  response.json({ order })
}
