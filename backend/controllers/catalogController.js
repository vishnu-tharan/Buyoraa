import mongoose from 'mongoose'
import Category from '../models/Category.js'
import Product, { activeProducts } from '../models/Product.js'
import { escapeSearch } from '../utils/query.js'

const productSorts = {
  newest: { createdAt: -1, _id: -1 },
  'price-asc': { price: 1, _id: 1 },
  'price-desc': { price: -1, _id: -1 },
}

function priceInCents(value) {
  if (typeof value !== 'string' || !/^\d{1,14}(\.\d{1,2})?$/.test(value)) return NaN

  const [rupees, cents = ''] = value.split('.')
  const amount = Number(rupees) * 100 + Number(cents.padEnd(2, '0'))
  return Number.isSafeInteger(amount) ? amount : NaN
}

export async function listCategories(request, response) {
  const categories = await Category.find().sort({ name: 1, _id: 1 })
  response.json({ categories })
}

export async function listProducts(request, response) {
  const { page = '1', category, featured, q, minPrice, maxPrice, sort = 'newest' } = request.query
  const pageNumber = Number(page)
  const pageSize = 24

  if (typeof page !== 'string' || !/^\d+$/.test(page) || pageNumber < 1 || pageNumber > 1000) {
    return response.status(400).json({ message: 'Page must be a whole number between 1 and 1000.' })
  }

  const filters = { ...activeProducts }
  if (typeof sort !== 'string' || !Object.hasOwn(productSorts, sort)) {
    return response.status(400).json({ message: 'Choose a valid product sort order.' })
  }

  if (q !== undefined) {
    if (typeof q !== 'string' || q.length > 100) {
      return response.status(400).json({ message: 'Search must be at most 100 characters.' })
    }

    const search = q.trim()
    if (search) {
      const literalSearch = escapeSearch(search)
      filters.name = { $regex: literalSearch, $options: 'i' }
    }
  }

  if (minPrice !== undefined || maxPrice !== undefined) {
    const minimum = minPrice === undefined ? 0 : priceInCents(minPrice)
    const maximum = maxPrice === undefined ? Number.MAX_SAFE_INTEGER : priceInCents(maxPrice)

    if (Number.isNaN(minimum) || Number.isNaN(maximum) || minimum > maximum) {
      return response.status(400).json({ message: 'Enter a valid price range in rupees.' })
    }

    filters.price = { $gte: minimum, $lte: maximum }
  }

  if (featured !== undefined) {
    if (featured !== 'true' && featured !== 'false') {
      return response.status(400).json({ message: 'Featured must be true or false.' })
    }

    filters.featured = featured === 'true'
  }

  if (category !== undefined) {
    if (typeof category !== 'string' || category.length > 100 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(category)) {
      return response.status(400).json({ message: 'Enter a valid category slug.' })
    }

    const selectedCategory = await Category.findOne({ slug: category }).select('_id')
    if (!selectedCategory) {
      return response.json({ products: [], page: pageNumber, pageSize, total: 0 })
    }

    filters.category = selectedCategory._id
  }

  const [products, total] = await Promise.all([
    Product.find(filters)
      .populate('category', 'name slug')
      .sort(productSorts[sort])
      .skip((pageNumber - 1) * pageSize)
      .limit(pageSize),
    Product.countDocuments(filters),
  ])

  response.json({ products, page: pageNumber, pageSize, total })
}

export async function getProduct(request, response) {
  if (!mongoose.isObjectIdOrHexString(request.params.id)) {
    return response.status(400).json({ message: 'Enter a valid product ID.' })
  }

  const product = await Product.findOne({ _id: request.params.id, ...activeProducts }).populate('category', 'name slug')
  if (!product) {
    return response.status(404).json({ message: 'Product not found.' })
  }

  response.json({ product })
}
