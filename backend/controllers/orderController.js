import { createHash } from 'node:crypto'
import mongoose from 'mongoose'
import Order, { orderStatuses } from '../models/Order.js'
import Product, { activeProducts, StockChange } from '../models/Product.js'
import User from '../models/User.js'
import { readAddress, readPhone } from '../utils/address.js'
import { calculateCart, validateCartItems } from './cartController.js'

const checkoutKeyPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/
const checkoutLimit = 5
const checkoutWindowMs = 15 * 60 * 1000
const stockChanged = new Error('Stock changed during checkout.')
const restockFailed = new Error('Could not restore order stock.')

class CheckoutLimitError extends Error {
  constructor(retryAfter) {
    super('Too many orders. Please wait before placing another order.')
    this.retryAfter = retryAfter
  }
}

export const nextStatuses = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
}

export async function changeOrderStatus({ orderId, status, customerId }) {
  const filter = { _id: orderId }
  if (customerId) filter.user = customerId

  try {
    return await mongoose.connection.transaction(async (session) => {
      const order = await Order.findOne(filter).session(session)
      if (!order) return { httpStatus: 404, message: 'Order not found.' }
      if (order.orderStatus === status) return { httpStatus: 204 }

      if (customerId && (order.orderStatus !== 'pending' || order.paymentStatus !== 'pending')) {
        return { httpStatus: 409, message: 'You can only cancel an unpaid order while it is pending.' }
      }
      if (!nextStatuses[order.orderStatus]?.includes(status)) {
        return { httpStatus: 409, message: 'This order cannot move to that status. Reload it to see its current status.' }
      }

      order.orderStatus = status
      if (status === 'delivered') order.paymentStatus = 'paid'
      await order.save({ session })

      if (status === 'cancelled') {
        const changes = []
        for (const { product, quantity } of order.orderItems) {
          const restored = await Product.findOneAndUpdate(
            { _id: product, stock: { $lte: Number.MAX_SAFE_INTEGER - quantity } },
            { $inc: { stock: quantity, __v: 1 } },
            { session, returnDocument: 'after' },
          ).select('stock').lean()
          if (!restored) throw restockFailed
          changes.push({ product, order: order._id, reason: 'cancellation', quantityChange: quantity, stockAfter: restored.stock })
        }
        await StockChange.insertMany(changes, { session })
      }

      return { httpStatus: 204 }
    })
  } catch (error) {
    if (error !== restockFailed) throw error
    return { httpStatus: 409, message: 'The order could not be cancelled because stock could not be restored.' }
  }
}

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

async function checkOrderLimit(user, session) {
  // A write to the account makes concurrent checkouts for that account retry in order.
  await User.updateOne({ _id: user }, { $inc: { checkoutVersion: 1 } }, { session, timestamps: false })

  const now = Date.now()
  const oldestOrderAtLimit = await Order.findOne({ user, createdAt: { $gt: new Date(now - checkoutWindowMs) } })
    .sort({ createdAt: -1, _id: -1 })
    .skip(checkoutLimit - 1)
    .select('createdAt')
    .session(session)
    .lean()

  if (oldestOrderAtLimit) {
    const retryAfter = Math.ceil((oldestOrderAtLimit.createdAt.getTime() + checkoutWindowMs - now) / 1000)
    throw new CheckoutLimitError(retryAfter)
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
  const { items, shippingAddress, expectedTotal, checkoutKey, deliveryInstructions = '' } = request.body ?? {}
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
  if (typeof deliveryInstructions !== 'string' || deliveryInstructions.trim().length > 300) {
    return response.status(400).json({ message: 'Use up to 300 characters for delivery instructions.' })
  }

  const delivery = { ...address, name, phone }
  const instructions = deliveryInstructions.trim() || undefined
  const sortedItems = cart.items.toSorted((first, second) => first.productId.localeCompare(second.productId))
  const checkoutFingerprint = createHash('sha256')
    .update(JSON.stringify({ items: sortedItems, delivery, instructions }))
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

      await checkOrderLimit(user, session)

      const orderItems = []
      const changes = []
      for (const { product, quantity } of quote.lines) {
        const updated = await Product.updateOne(
          { _id: product._id, stock: { $gte: quantity }, ...activeProducts },
          { $inc: { stock: -quantity, __v: 1 } },
          { session },
        )
        if (updated.modifiedCount !== 1) throw stockChanged

        orderItems.push({ product: product._id, name: product.name, price: product.price, quantity })
        changes.push({ product: product._id, reason: 'order', quantityChange: -quantity, stockAfter: product.stock - quantity })
      }

      const [order] = await Order.create([{
        user, orderItems, shippingAddress: delivery, checkoutKey, checkoutFingerprint,
        deliveryInstructions: instructions,
        subtotal: quote.subtotal, shippingFee: quote.shippingFee, totalAmount: quote.totalAmount,
      }], { session })
      await StockChange.insertMany(changes.map((change) => ({ ...change, order: order._id })), { session })

      return { order, created: true }
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } })
  } catch (error) {
    if (error instanceof CheckoutLimitError) {
      return response.set('Retry-After', String(error.retryAfter)).status(429).json({ message: error.message })
    }
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
  const { page = '1', q = '', status } = request.query
  const pageNumber = Number(page)
  const pageSize = 20

  if (typeof page !== 'string' || !/^\d+$/.test(page) || pageNumber < 1 || pageNumber > 1000) {
    return response.status(400).json({ message: 'Page must be a whole number between 1 and 1000.' })
  }

  const filter = { user: request.user.id }
  if (typeof q !== 'string' || q.length > 25) {
    return response.status(400).json({ message: 'Enter the 8-character order number or full order ID.' })
  }
  const orderNumber = q.trim().replace(/^#/, '').toLowerCase()
  if (q.trim() && !/^(?:[a-f0-9]{8}|[a-f0-9]{24})$/.test(orderNumber)) {
    return response.status(400).json({ message: 'Enter the 8-character order number or full order ID.' })
  }
  if (status !== undefined && !orderStatuses.includes(status)) {
    return response.status(400).json({ message: 'Choose a valid order status.' })
  }

  if (status) filter.orderStatus = status
  if (orderNumber.length === 24) filter._id = new mongoose.Types.ObjectId(orderNumber)
  if (orderNumber.length === 8) {
    filter.$expr = { $eq: [{ $substrCP: [{ $toString: '$_id' }, 16, 8] }, orderNumber] }
  }

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

export async function cancelOrder(request, response) {
  const { id } = request.params
  if (!mongoose.isObjectIdOrHexString(id)) {
    return response.status(400).json({ message: 'Enter a valid order ID.' })
  }

  const result = await changeOrderStatus({ orderId: id, status: 'cancelled', customerId: request.user.id })
  if (result.message) return response.status(result.httpStatus).json({ message: result.message })
  response.sendStatus(result.httpStatus)
}
