import Order from '../models/Order.js'
import Product, { activeProducts } from '../models/Product.js'
import User from '../models/User.js'
import { escapeSearch, readPage } from '../utils/query.js'

export async function adminOverview(request, response) {
  const [productCount, customerCount, orderCount, totals, recentOrders] = await Promise.all([
    Product.countDocuments(activeProducts),
    User.countDocuments({ role: 'customer' }),
    Order.countDocuments(),
    Order.aggregate([
      { $match: { orderStatus: 'delivered', paymentStatus: 'paid' } },
      { $group: { _id: null, revenue: { $sum: '$totalAmount' } } },
    ]),
    Order.find()
      .select('user createdAt orderStatus totalAmount')
      .populate('user', 'name')
      .sort({ createdAt: -1, _id: -1 })
      .limit(5)
      .lean(),
  ])

  response.json({ productCount, customerCount, orderCount, revenue: totals[0]?.revenue ?? 0, recentOrders })
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
