import Order, { DiscountCode, getDeliveryEstimate, readDiscountCode, saveDeliveryEstimate } from '../models/Order.js'
import Product, { activeProducts } from '../models/Product.js'
import User from '../models/User.js'
import { escapeSearch, readPage } from '../utils/query.js'

const dayMs = 24 * 60 * 60 * 1000
const colomboOffsetMs = 330 * 60 * 1000

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

function readRupees(value) {
  if (typeof value !== 'string' || !/^\d{1,10}(\.\d{1,2})?$/.test(value)) return null
  const [rupees, cents = ''] = value.split('.')
  return Number(rupees) * 100 + Number(cents.padEnd(2, '0'))
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
  const amount = readRupees(rawAmount)
  const minimumSubtotal = readRupees(rawMinimum)
  if (!code) return response.status(400).json({ message: 'Use 3 to 24 letters, numbers or hyphens. Start with a letter or number.' })
  if (!amount || minimumSubtotal === null) {
    return response.status(400).json({ message: 'Enter a positive discount and a minimum subtotal of zero or more in LKR.' })
  }
  const date = typeof expiry === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(expiry) ? new Date(`${expiry}T00:00:00Z`) : null
  if (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== expiry) {
    return response.status(400).json({ message: 'Choose a valid expiry date.' })
  }
  const expiresAt = new Date(`${expiry}T23:59:59.999+05:30`)
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
      { $match: { orderStatus: { $in: ['delivered', 'returned'] }, paymentStatus: 'paid' } },
      { $facet: {
        total: [{ $group: { _id: null, revenue: { $sum: '$totalAmount' } } }],
        days: [
          { $set: { collectedAt: { $ifNull: ['$paidAt', '$updatedAt', '$createdAt'] } } },
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
