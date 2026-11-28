import Order, { DiscountCode, getDeliveryEstimate, readDiscountCode, saveDeliveryEstimate } from '../models/Order.js'
import Product, { activeProducts } from '../models/Product.js'
import User from '../models/User.js'
import { dayMs, escapeSearch, readPage, readRupees, readSriLankaDate } from '../utils/query.js'

const colomboOffsetMs = 330 * 60 * 1000
const collectedOrders = { orderStatus: { $in: ['delivered', 'returned'] }, paymentStatus: 'paid' }
const collectionDate = { $ifNull: ['$paidAt', '$updatedAt', '$createdAt'] }

export async function adminDeliveryEstimate(request, response) {
  response.json({ deliveryEstimate: await getDeliveryEstimate() })
}

export async function updateDeliveryEstimate(request, response) {
  const { minDays, maxDays } = request.body ?? {}
  if (!Number.isInteger(minDays) || !Number.isInteger(maxDays) || minDays < 1 || minDays > maxDays || maxDays > 60) {
    return response.status(400).json({ message: 'Enter a delivery window from 1 to 60 days, with the minimum on or before the maximum.' })
  }
  await saveDeliveryEstimate({ minDays, maxDays })
  response.sendStatus(204)
}

export async function adminDiscounts(request, response) {
  const page = readPage(request.query.page)
  if (!page) return response.status(400).json({ message: 'Choose a valid page.' })
  const pageSize = 20
  const [discounts, total] = await Promise.all([
    DiscountCode.find().sort({ createdAt: -1, _id: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
    DiscountCode.countDocuments(),
  ])
  response.json({ discounts, total, page, pageSize })
}

export async function createDiscount(request, response) {
  const { code: input, amount: rawAmount, minimumSubtotal: rawMinimum, expiry } = request.body ?? {}
  const code = readDiscountCode(input)
  const amount = readRupees(rawAmount, 10)
  const minimumSubtotal = readRupees(rawMinimum, 10)
  if (!code) return response.status(400).json({ message: 'Use 3 to 24 letters, numbers or hyphens. Start with a letter or number.' })
  if (!amount || minimumSubtotal === null) {
    return response.status(400).json({ message: 'Enter a positive discount and a minimum subtotal of zero or more in LKR.' })
  }
  const date = readSriLankaDate(expiry)
  if (!date) {
    return response.status(400).json({ message: 'Choose a valid expiry date.' })
  }
  const expiresAt = new Date(date.getTime() + dayMs - 1)
  if (expiresAt <= new Date()) return response.status(400).json({ message: 'Choose an expiry date that has not passed in Sri Lanka.' })

  try {
    await DiscountCode.create({ code, amount, minimumSubtotal, expiresAt })
  } catch (error) {
    if (error.code !== 11000) throw error
    return response.status(409).json({ message: 'That discount code already exists.' })
  }
  response.sendStatus(201)
}

export async function disableDiscount(request, response) {
  const result = await DiscountCode.updateOne({ _id: request.params.id }, { $set: { active: false } })
  if (!result.matchedCount) return response.status(404).json({ message: 'Discount code not found.' })
  response.sendStatus(204)
}

export async function adminOverview(request, response) {
  const today = Math.floor((Date.now() + colomboOffsetMs) / dayMs) * dayMs
  const firstDay = today - 6 * dayMs
  const lowStock = { ...activeProducts, stock: { $lte: 5 } }
  const [productCount, customerCount, orderCount, collected, recentOrders, lowStockCount, lowStockProducts] = await Promise.all([
    Product.countDocuments(activeProducts),
    User.countDocuments({ role: 'customer' }),
    Order.countDocuments(),
    Order.aggregate([
      { $match: collectedOrders },
      { $facet: {
        total: [{ $group: { _id: null, revenue: { $sum: '$totalAmount' } } }],
        days: [
          { $set: { collectedAt: collectionDate } },
          { $match: { collectedAt: { $gte: new Date(firstDay - colomboOffsetMs), $lt: new Date(today + dayMs - colomboOffsetMs) } } },
          { $group: {
            _id: { $dateToString: { date: '$collectedAt', format: '%Y-%m-%d', timezone: 'Asia/Colombo' } },
            revenue: { $sum: '$totalAmount' },
          } },
        ],
      } },
    ]),
    Order.find()
      .select('user createdAt orderStatus totalAmount')
      .populate('user', 'name')
      .sort({ createdAt: -1, _id: -1 })
      .limit(5)
      .lean(),
    Product.countDocuments(lowStock),
    Product.find(lowStock).select('name stock').sort({ stock: 1, name: 1, _id: 1 }).limit(5).lean(),
  ])

  const dailyTotals = new Map((collected[0]?.days ?? []).map(({ _id, revenue }) => [_id, revenue]))
  const sales = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(firstDay + index * dayMs).toISOString().slice(0, 10)
    return { date, revenue: dailyTotals.get(date) ?? 0 }
  })
  response.json({
    productCount, customerCount, orderCount, revenue: collected[0]?.total[0]?.revenue ?? 0,
    recentOrders, lowStockCount, lowStockProducts, sales,
  })
}

export async function adminSalesReport(request, response) {
  const { from, to } = request.query
  const start = readSriLankaDate(from)
  const end = readSriLankaDate(to)
  if (!start || !end || start > end) {
    return response.status(400).json({ message: 'Choose valid start and end dates, with the start on or before the end.' })
  }
  const range = { $gte: start, $lt: new Date(end.getTime() + dayMs) }
  const paidInRange = {
    ...collectedOrders,
    $or: [
      { paidAt: range },
      { paidAt: null, updatedAt: range },
      { paidAt: null, updatedAt: null, createdAt: range },
    ],
  }

  const [report] = await Order.aggregate([
    { $match: { $or: [{ createdAt: range }, paidInRange, { 'refunds.refundedOn': range }] } },
    { $facet: {
      placed: [{ $match: { createdAt: range } }, { $count: 'count' }],
      payments: [
        { $match: paidInRange },
        { $group: { _id: null, count: { $sum: 1 }, gross: { $sum: '$totalAmount' } } },
      ],
      refunds: [
        { $unwind: '$refunds' },
        { $match: { 'refunds.refundedOn': range } },
        { $group: { _id: null, total: { $sum: '$refunds.amount' } } },
      ],
      topProducts: [
        { $match: paidInRange },
        { $unwind: '$orderItems' },
        { $group: {
          _id: '$orderItems.product',
          name: { $max: '$orderItems.name' },
          units: { $sum: '$orderItems.quantity' },
        } },
        { $sort: { units: -1, name: 1, _id: 1 } },
        { $limit: 10 },
      ],
    } },
  ])

  const gross = report.payments[0]?.gross ?? 0
  const refunded = report.refunds[0]?.total ?? 0
  response.json({
    ordersPlaced: report.placed[0]?.count ?? 0,
    paidOrders: report.payments[0]?.count ?? 0,
    gross, refunded, net: gross - refunded, topProducts: report.topProducts,
  })
}

export async function adminUsers(request, response) {
  const { q = '' } = request.query
  const page = readPage(request.query.page)
  if (!page || typeof q !== 'string' || q.length > 100) {
    return response.status(400).json({ message: 'Enter a valid page and search of up to 100 characters.' })
  }

  const search = q.trim()
  const filters = { role: 'customer' }
  if (search) {
    const term = { $regex: escapeSearch(search), $options: 'i' }
    filters.$or = [{ name: term }, { email: term }]
  }

  const pageSize = 50
  const [users, total] = await Promise.all([
    User.find(filters)
      .select('name email createdAt')
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    User.countDocuments(filters),
  ])

  response.json({ users, page, pageSize, total })
}
