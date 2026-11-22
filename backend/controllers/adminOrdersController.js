import mongoose from 'mongoose'
import Order, { orderStatuses } from '../models/Order.js'
import User from '../models/User.js'
import { escapeSearch, readPage } from '../utils/query.js'
import { changeOrderStatus, nextStatuses } from './orderController.js'

const dayMs = 24 * 60 * 60 * 1000

function readOrderDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const midnight = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(midnight.getTime()) || midnight.toISOString().slice(0, 10) !== value) return null
  return new Date(`${value}T00:00:00+05:30`)
}

async function orderSearch(term) {
  const number = term.replace(/^#/, '').toLowerCase()
  if (/^[a-f0-9]{24}$/.test(number)) return { _id: new mongoose.Types.ObjectId(number) }

  const name = { $regex: escapeSearch(term), $options: 'i' }
  const customerMatches = [{ name }]
  const matches = [{ 'shippingAddress.name': name }]
  if (/^[a-f0-9]{8}$/.test(number)) {
    matches.push({ $expr: { $eq: [{ $substrCP: [{ $toString: '$_id' }, 16, 8] }, number] } })
  }

  const digits = term.replace(/\D/g, '')
  if (digits.length >= 3 && digits.length <= 15 && /^\+?[\d ()-]+$/.test(term)) {
    const phone = { $regex: digits.split('').join('[ ()-]*') }
    customerMatches.push({ phone })
    matches.push({ 'shippingAddress.phone': phone })
  }

  const customers = await User.distinct('_id', { $or: customerMatches })
  if (customers.length) matches.push({ user: { $in: customers } })
  return { $or: matches }
}

export async function adminOrders(request, response) {
  const { status, q = '', from, to } = request.query
  const page = readPage(request.query.page)
  if (!page || (status !== undefined && !orderStatuses.includes(status))) {
    return response.status(400).json({ message: 'Choose a valid page and order status.' })
  }
  if (typeof q !== 'string' || q.length > 100) {
    return response.status(400).json({ message: 'Use up to 100 characters to search orders.' })
  }

  const start = from === undefined ? undefined : readOrderDate(from)
  const end = to === undefined ? undefined : readOrderDate(to)
  if (start === null || end === null || (start && end && start > end)) {
    return response.status(400).json({ message: 'Choose valid dates with the start date on or before the end date.' })
  }

  const filters = status ? { orderStatus: status } : {}
  if (start || end) {
    filters.createdAt = {}
    if (start) filters.createdAt.$gte = start
    if (end) filters.createdAt.$lt = new Date(end.getTime() + dayMs)
  }
  const term = q.trim()
  if (term) Object.assign(filters, await orderSearch(term))
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
