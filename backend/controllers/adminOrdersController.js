import Order, { orderStatuses } from '../models/Order.js'
import { readPage } from '../utils/query.js'
import { changeOrderStatus, nextStatuses } from './orderController.js'

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

  const result = await changeOrderStatus({ orderId: request.params.id, status })
  if (result.message) return response.status(result.httpStatus).json({ message: result.message })
  response.sendStatus(result.httpStatus)
}
