import Order from '../models/Order.js'
import Product, { activeProducts } from '../models/Product.js'
import User from '../models/User.js'
import { escapeSearch, readPage } from '../utils/query.js'

const dayMs = 24 * 60 * 60 * 1000
const colomboOffsetMs = 330 * 60 * 1000

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
