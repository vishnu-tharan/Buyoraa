import { createHash } from 'node:crypto'
import mongoose from 'mongoose'
import Order, { getDeliveryEstimate, orderStatuses, readDiscountCode } from '../models/Order.js'
import Product, { activeProducts, StockChange } from '../models/Product.js'
import User from '../models/User.js'
import { readDeliveryDetails } from '../utils/address.js'
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
  shipped: ['delivered', 'delivery_failed'],
  delivered: ['returned'],
  delivery_failed: ['returned'],
  returned: [],
  cancelled: [],
}

export async function changeOrderStatus({ orderId, status, actor, customerId, restock }) {
  const filter = { _id: orderId }
  if (customerId) filter.user = customerId
  const returning = status === 'returned'
  const stockReason = returning ? 'return' : 'cancellation'

  try {
    return await mongoose.connection.transaction(async (session) => {
      const order = await Order.findOne(filter).select('+returnRestocked +statusHistory').session(session)
      if (!order) return { httpStatus: 404, message: 'Order not found.' }
      if (order.orderStatus === status) {
        if (returning && order.returnRestocked !== restock) {
          return { httpStatus: 409, message: 'This return has already been recorded. Check the stock decision on the order.' }
        }
        return { httpStatus: 204, unchanged: true }
      }

      if (customerId && (order.orderStatus !== 'pending' || order.paymentStatus !== 'pending')) {
        return { httpStatus: 409, message: 'You can only cancel an unpaid order while it is pending.' }
      }
      if (!nextStatuses[order.orderStatus]?.includes(status)) {
        return { httpStatus: 409, message: 'This order cannot move to that status. Reload it to see its current status.' }
      }

      const changedAt = new Date()
      order.statusHistory ??= []
      order.statusHistory.push({
        from: order.orderStatus, to: status, actor: { user: actor.id, name: actor.name },
        source: customerId ? 'customer' : 'admin', changedAt,
      })
      order.orderStatus = status
      if (status === 'delivered') {
        order.paymentStatus = 'paid'
        order.paidAt = changedAt
      } else if (order.paymentStatus === 'paid' && !order.paidAt) {
        // Retain the legacy collection date when a later status changes updatedAt.
        order.paidAt = order.updatedAt ?? order.createdAt
      }
      if (returning) order.returnRestocked = restock
      await order.save({ session })

      if (status === 'cancelled' || (returning && restock)) {
        const changes = []
        for (const { product, quantity } of order.orderItems) {
          const restored = await Product.findOneAndUpdate(
            { _id: product, stock: { $lte: Number.MAX_SAFE_INTEGER - quantity } },
            { $inc: { stock: quantity, __v: 1 } },
            { session, returnDocument: 'after' },
          ).select('stock').lean()
          if (!restored) throw restockFailed
          changes.push({ product, order: order._id, reason: stockReason, quantityChange: quantity, stockAfter: restored.stock })
        }
        await StockChange.insertMany(changes, { session })
      }

      return { httpStatus: 204 }
    })
  } catch (error) {
    if (error !== restockFailed) throw error
    return { httpStatus: 409, message: `The ${stockReason} could not be saved because stock could not be restored.` }
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
  const { items, expectedTotal, checkoutKey, discountCode = '' } = request.body ?? {}
  const cart = validateCartItems(items)
  if (cart.error || !cart.items.length) {
    return response.status(400).json({ message: cart.error || 'Your cart is empty.' })
  }
  if (typeof checkoutKey !== 'string' || !checkoutKeyPattern.test(checkoutKey)
    || !Number.isSafeInteger(expectedTotal) || expectedTotal < 0) {
    return response.status(400).json({ message: 'Review your checkout details and try again.' })
  }

  const { delivery, instructions, error } = readDeliveryDetails(request.body ?? {})
  if (error) return response.status(400).json({ message: error })
  const code = readDiscountCode(discountCode)
  if (code === null) return response.status(400).json({ message: 'Enter a valid discount code.' })
  const sortedItems = cart.items.toSorted((first, second) => first.productId.localeCompare(second.productId))
  const checkoutFingerprint = createHash('sha256')
    .update(JSON.stringify({ items: sortedItems, delivery, instructions, discountCode: code || undefined }))
    .digest('hex')
  const user = request.user.id

  let result
  try {
    result = await mongoose.connection.transaction(async (session) => {
      const previousOrder = await findAttempt(user, checkoutKey, session)
      if (previousOrder) return { order: previousOrder }

      const quote = await calculateCart(sortedItems, session, code)
      if (quote.discountError) return { message: quote.discountError }
      if (!Number.isSafeInteger(quote.subtotal)) return { message: 'The cart total is too large. Reduce the quantities and try again.' }
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
        deliveryEstimate: await getDeliveryEstimate(session) ?? undefined,
        discountCode: quote.discountCode,
        discountAmount: quote.discountAmount || undefined,
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

  const result = await changeOrderStatus({ orderId: id, status: 'cancelled', actor: request.user, customerId: request.user.id })
  if (result.message) return response.status(result.httpStatus).json({ message: result.message })
  response.sendStatus(result.httpStatus)
}

export async function updateDelivery(request, response) {
  const { id } = request.params
  if (!mongoose.isObjectIdOrHexString(id)) return response.status(400).json({ message: 'Enter a valid order ID.' })

  const { delivery, instructions, error } = readDeliveryDetails(request.body ?? {})
  if (error) return response.status(400).json({ message: error })

  const owner = { _id: id, user: request.user.id }
  const changes = { $set: { shippingAddress: delivery } }
  if (instructions) changes.$set.deliveryInstructions = instructions
  else changes.$unset = { deliveryInstructions: 1 }
  const result = await Order.updateOne({ ...owner, orderStatus: 'pending', paymentStatus: 'pending' }, changes)
  if (result.matchedCount) return response.sendStatus(204)
  if (!(await Order.exists(owner))) return response.status(404).json({ message: 'Order not found.' })
  response.status(409).json({ message: 'You can only edit delivery details while the order is unpaid and pending.' })
}
