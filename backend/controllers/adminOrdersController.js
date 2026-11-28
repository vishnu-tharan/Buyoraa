import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
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

async function readOrderFilters({ status, q = '', from, to }) {
  if (status !== undefined && !orderStatuses.includes(status)) {
    return { message: 'Choose a valid order status.' }
  }
  if (typeof q !== 'string' || q.length > 100) {
    return { message: 'Use up to 100 characters to search orders.' }
  }

  const start = from === undefined ? undefined : readOrderDate(from)
  const end = to === undefined ? undefined : readOrderDate(to)
  if (start === null || end === null || (start && end && start > end)) {
    return { message: 'Choose valid dates with the start date on or before the end date.' }
  }

  const filters = status ? { orderStatus: status } : {}
  if (start || end) {
    filters.createdAt = {}
    if (start) filters.createdAt.$gte = start
    if (end) filters.createdAt.$lt = new Date(end.getTime() + dayMs)
  }
  const term = q.trim()
  if (term) Object.assign(filters, await orderSearch(term))
  return { filters }
}

function orderListQuery(filters) {
  return Order.find(filters)
    .select('user createdAt orderStatus paymentStatus totalAmount')
    .sort({ createdAt: -1, _id: -1 })
    .lean()
}

export async function adminOrders(request, response) {
  const page = readPage(request.query.page)
  if (!page) return response.status(400).json({ message: 'Choose a valid page.' })
  const { filters, message } = await readOrderFilters(request.query)
  if (message) return response.status(400).json({ message })

  const pageSize = 20
  const [orders, total] = await Promise.all([
    orderListQuery(filters).populate('user', 'name email').skip((page - 1) * pageSize).limit(pageSize),
    Order.countDocuments(filters),
  ])

  response.json({ orders, page, pageSize, total })
}

function csvCell(value) {
  const text = String(value ?? '')
  // Spreadsheet programs may interpret these cells as formulas even when quoted.
  const safe = /^[\t\r\n]|^\s*[=+@-]/u.test(text) ? `'${text}` : text
  return `"${safe.replaceAll('"', '""')}"`
}

async function* orderCsv(filters) {
  const cursor = orderListQuery(filters).populate('user', 'name').cursor({ batchSize: 100 })
  try {
    yield '\uFEFFOrder ID,Customer,Placed (UTC),Order status,Payment status,Total (LKR)\r\n'
    for await (const order of cursor) {
      const row = [order._id, order.user?.name, order.createdAt.toISOString(), order.orderStatus,
        order.paymentStatus, (order.totalAmount / 100).toFixed(2)]
      yield `${row.map(csvCell).join(',')}\r\n`
    }
  } finally {
    await cursor.close()
  }
}

export async function exportAdminOrders(request, response) {
  const { filters, message } = await readOrderFilters(request.query)
  if (message) return response.status(400).json({ message })

  response.attachment('buyora-orders.csv').type('text/csv; charset=utf-8')
  await pipeline(Readable.from(orderCsv(filters)), response)
}

export async function adminOrder(request, response) {
  const order = await Order.findById(request.params.id).select('+returnRestocked +adminNotes').populate('user', 'name email').lean()
  if (!order) return response.status(404).json({ message: 'Order not found.' })
  response.json({ order, allowedStatuses: nextStatuses[order.orderStatus] })
}

export async function addOrderNote(request, response) {
  const text = typeof request.body?.text === 'string' ? request.body.text.trim() : ''
  if (!text || text.length > 500) {
    return response.status(400).json({ message: 'Write a note of 1 to 500 characters.' })
  }
  const id = request.params.id
  const result = await Order.findOneAndUpdate({ _id: id, 'adminNotes.49': { $exists: false } }, {
    $push: { adminNotes: { text, author: request.user.name, createdAt: new Date() } },
  }, { returnDocument: 'after', runValidators: true, timestamps: false }).select('+adminNotes').lean()
  if (result) return response.status(201).json({ note: result.adminNotes.at(-1) })
  if (!(await Order.exists({ _id: id }))) return response.status(404).json({ message: 'Order not found.' })
  response.status(409).json({ message: 'This order already has 50 staff notes.' })
}

export async function updateOrderStatus(request, response) {
  const { status, restock } = request.body ?? {}
  if (!orderStatuses.includes(status)) {
    return response.status(400).json({ message: 'Choose a valid order status.' })
  }
  if (status === 'returned' && typeof restock !== 'boolean') {
    return response.status(400).json({ message: 'Choose whether to restock the returned items.' })
  }

  const result = await changeOrderStatus({ orderId: request.params.id, status, restock })
  if (result.message) return response.status(result.httpStatus).json({ message: result.message })
  response.sendStatus(result.httpStatus)
}
