import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import mongoose from 'mongoose'
import Order, { orderStatuses } from '../models/Order.js'
import User from '../models/User.js'
import { dayMs, escapeSearch, readPage, readRupees, readSriLankaDate } from '../utils/query.js'
import { changeOrderStatus, nextStatuses } from './orderController.js'

const refundIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

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

  const start = from === undefined ? undefined : readSriLankaDate(from)
  const end = to === undefined ? undefined : readSriLankaDate(to)
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
  const order = await Order.findById(request.params.id).select('+returnRestocked +adminNotes +statusHistory +refunds').populate('user', 'name email').lean()
  if (!order) return response.status(404).json({ message: 'Order not found.' })
  response.json({ order, allowedStatuses: nextStatuses[order.orderStatus] })
}

export async function recordRefund(request, response) {
  const { amount: rawAmount, refundedOn, reason: rawReason, refundId } = request.body ?? {}
  const amount = readRupees(rawAmount)
  const date = readSriLankaDate(refundedOn)
  const reason = typeof rawReason === 'string' ? rawReason.trim() : ''
  if (!amount || !date || date > new Date() || !reason || reason.length > 500
    || typeof refundId !== 'string' || !refundIdPattern.test(refundId)) {
    return response.status(400).json({ message: 'Enter a positive LKR amount, a valid refund date, and a reason of up to 500 characters.' })
  }

  const result = await mongoose.connection.transaction(async (session) => {
    const order = await Order.findById(request.params.id).select('+refunds').session(session)
    if (!order) return { status: 404, message: 'Order not found.' }
    const refunds = order.refunds ?? []
    const previous = refunds.find(({ _id }) => _id === refundId)
    if (previous) {
      if (previous.amount !== amount || previous.reason !== reason || previous.refundedOn.getTime() !== date.getTime()) {
        return { status: 409, message: 'This refund was already recorded with different details.' }
      }
      return { status: 200 }
    }
    if (order.orderStatus !== 'returned' || order.paymentStatus !== 'paid' || order.paymentMethod !== 'cash_on_delivery') {
      return { status: 409, message: 'You can only record a refund for a paid, returned Cash on Delivery order.' }
    }
    if ((order.paidAt ?? order.createdAt) >= new Date(date.getTime() + dayMs)) {
      return { status: 400, message: 'The refund date must be on or after the payment date.' }
    }
    const alreadyRefunded = refunds.reduce((sum, refund) => sum + refund.amount, 0)
    if (amount > order.totalAmount - alreadyRefunded) {
      return { status: 409, message: 'The refund exceeds the remaining amount paid for this order.' }
    }
    order.refunds ??= []
    order.refunds.push({
      _id: refundId, amount, refundedOn: date, reason, recordedAt: new Date(),
      actor: { user: request.user.id, name: request.user.name },
    })
    await order.save({ session, timestamps: false })
    return { status: 201 }
  })

  if (result.message) return response.status(result.status).json({ message: result.message })
  response.sendStatus(result.status)
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

  const result = await changeOrderStatus({ orderId: request.params.id, status, actor: request.user, restock })
  if (result.message) return response.status(result.httpStatus).json({ message: result.message })
  response.sendStatus(result.httpStatus)
}

export async function confirmOrders(request, response) {
  const { orderIds } = request.body ?? {}
  if (!Array.isArray(orderIds) || orderIds.length < 1 || orderIds.length > 20
    || orderIds.some((id) => typeof id !== 'string' || !mongoose.isObjectIdOrHexString(id))) {
    return response.status(400).json({ message: 'Select between 1 and 20 valid orders.' })
  }
  const ids = [...new Set(orderIds.map((id) => id.toLowerCase()))]
  const changes = await Promise.allSettled(ids.map((orderId) =>
    changeOrderStatus({ orderId, status: 'confirmed', actor: request.user }),
  ))
  const results = changes.map((change, index) => {
    const orderId = ids[index]
    if (change.status === 'rejected') {
      console.error(`Bulk order confirmation failed: ${change.reason?.name ?? 'Error'}`)
      return { orderId, outcome: 'skipped', message: 'Couldn’t confirm this order. Reload to check its status.' }
    }
    if (change.value.unchanged) return { orderId, outcome: 'already_confirmed' }
    if (change.value.httpStatus === 204) return { orderId, outcome: 'confirmed' }
    return { orderId, outcome: 'skipped', message: change.value.message }
  })
  response.json({ results })
}
