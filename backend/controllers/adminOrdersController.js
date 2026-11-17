import mongoose from 'mongoose'
import Order, { orderStatuses } from '../models/Order.js'
import Product from '../models/Product.js'
import { readPage } from '../utils/query.js'

const nextStatuses = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
}
const restockFailed = new Error('Could not restore order stock.')

export async function adminOrders(request, response) {
  const { status } = request.query
  const page = readPage(request.query.page)
  if (!page || (status !== undefined && !orderStatuses.includes(status))) {
    return response.status(400).json({ message: 'Choose a valid page and order status.' })
  }

  const filters = status ? { orderStatus: status } : {}
  const pageSize = 20
  const [orders, total] = await Promise.all([
    Order.find(filters)
      .select('user createdAt orderStatus paymentStatus totalAmount')
      .populate('user', 'name email')
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    Order.countDocuments(filters),
  ])

  response.json({ orders, page, pageSize, total })
}

export async function adminOrder(request, response) {
  const order = await Order.findById(request.params.id).populate('user', 'name email').lean()
  if (!order) return response.status(404).json({ message: 'Order not found.' })
  response.json({ order, allowedStatuses: nextStatuses[order.orderStatus] })
}

export async function updateOrderStatus(request, response) {
  const status = request.body?.status
  if (!orderStatuses.includes(status)) {
    return response.status(400).json({ message: 'Choose a valid order status.' })
  }

  let result
  try {
    result = await mongoose.connection.transaction(async (session) => {
      const order = await Order.findById(request.params.id).session(session)
      if (!order) return { httpStatus: 404, message: 'Order not found.' }
      if (order.orderStatus === status) return { httpStatus: 204 }
      if (!nextStatuses[order.orderStatus].includes(status)) {
        return { httpStatus: 409, message: 'This order cannot move to that status. Reload it to see its current status.' }
      }

      order.orderStatus = status
      if (status === 'delivered') order.paymentStatus = 'paid'
      await order.save({ session })

      if (status === 'cancelled') {
        for (const { product, quantity } of order.orderItems) {
          const restored = await Product.updateOne(
            { _id: product, stock: { $lte: Number.MAX_SAFE_INTEGER - quantity } },
            { $inc: { stock: quantity, __v: 1 } },
            { session },
          )
          if (restored.modifiedCount !== 1) throw restockFailed
        }
      }

      return { httpStatus: 204 }
    })
  } catch (error) {
    if (error !== restockFailed) throw error
    return response.status(409).json({ message: 'The order could not be cancelled because stock could not be restored.' })
  }

  if (result.message) return response.status(result.httpStatus).json({ message: result.message })
  response.sendStatus(204)
}
