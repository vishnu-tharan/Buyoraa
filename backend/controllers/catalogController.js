import mongoose from 'mongoose'
import Category from '../models/Category.js'
import Order from '../models/Order.js'
import Product, { activeProducts, ProductReview } from '../models/Product.js'
import { escapeSearch, readPage } from '../utils/query.js'

const productSorts = {
  newest: { createdAt: -1, _id: -1 },
  'price-asc': { price: 1, _id: 1 },
  'price-desc': { price: -1, _id: -1 },
}

async function reviewRatings(productIds) {
  if (!productIds.length) return new Map()
  const ratings = await ProductReview.aggregate([
    { $match: { product: { $in: productIds } } },
    { $group: { _id: '$product', average: { $avg: '$stars' }, count: { $sum: 1 } } },
  ])
  return new Map(ratings.map(({ _id, ...rating }) => [String(_id), rating]))
}

async function ratedProducts(products) {
  const ratings = await reviewRatings(products.map(({ _id }) => _id))
  return products.map((product) => ({ ...product, rating: ratings.get(String(product._id)) ?? null }))
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
  const { page = '1', category, featured, q, minPrice, maxPrice, inStock, sort = 'newest' } = request.query
  const pageNumber = Number(page)
  const pageSize = 24

  if (typeof page !== 'string' || !/^\d+$/.test(page) || pageNumber < 1 || pageNumber > 1000) {
    return response.status(400).json({ message: 'Page must be a whole number between 1 and 1000.' })
  }

  const filters = { ...activeProducts }
  if (inStock !== undefined && inStock !== 'true' && inStock !== 'false') {
    return response.status(400).json({ message: 'In stock must be true or false.' })
  }
  if (inStock === 'true') filters.stock = { $gt: 0 }

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
      .limit(pageSize)
      .lean(),
    Product.countDocuments(filters),
  ])

  response.json({ products: await ratedProducts(products), page: pageNumber, pageSize, total })
}

export async function recentProducts(request, response) {
  const { ids } = request.query
  if (typeof ids !== 'string') {
    return response.status(400).json({ message: 'Provide up to five valid product IDs.' })
  }

  const productIds = ids.split(',')
  if (productIds.length > 5 || !productIds.every((id) => mongoose.isObjectIdOrHexString(id))) {
    return response.status(400).json({ message: 'Provide up to five valid product IDs.' })
  }

  const orderedIds = [...new Set(productIds.map((id) => id.toLowerCase()))]
  const products = await Product.find({ ...activeProducts, _id: { $in: orderedIds } })
    .populate('category', 'name slug')
    .lean()
  const byId = new Map(products.map((product) => [String(product._id), product]))

  response.set('Cache-Control', 'no-store').json({
    products: await ratedProducts(orderedIds.map((id) => byId.get(id)).filter(Boolean)),
  })
}

export async function getProduct(request, response) {
  if (!mongoose.isObjectIdOrHexString(request.params.id)) {
    return response.status(400).json({ message: 'Enter a valid product ID.' })
  }

  const product = await Product.findOne({ _id: request.params.id, ...activeProducts }).populate('category', 'name slug').lean()
  if (!product) {
    return response.status(404).json({ message: 'Product not found.' })
  }

  const relatedProducts = product.category
    ? await Product.find({
      ...activeProducts,
      category: product.category._id,
      _id: { $ne: product._id },
      stock: { $gt: 0 },
    })
      .populate('category', 'name slug')
      .sort({ createdAt: -1, _id: -1 })
      .limit(4)
      .lean()
    : []

  const [ratedProduct, ...ratedRelated] = await ratedProducts([product, ...relatedProducts])
  response.json({ product: ratedProduct, relatedProducts: ratedRelated })
}

async function hasDeliveredPurchase(user, product) {
  return Boolean(await Order.exists({
    user, 'orderItems.product': product, orderStatus: { $in: ['delivered', 'returned'] }, paymentStatus: 'paid',
  }))
}

export async function listReviews(request, response) {
  const { id } = request.params
  const page = readPage(request.query.page)
  if (!page || !mongoose.isObjectIdOrHexString(id)) return response.status(400).json({ message: 'Choose a valid product and review page.' })

  const product = new mongoose.Types.ObjectId(id)
  if (!(await Product.exists({ _id: product, ...activeProducts }))) return response.status(404).json({ message: 'Product not found.' })

  const pageSize = 10
  const [reviews, ratings] = await Promise.all([
    ProductReview.find({ product }).select('stars comment createdAt').sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * pageSize).limit(pageSize).lean(),
    reviewRatings([product]),
  ])
  const rating = ratings.get(id.toLowerCase()) ?? null
  response.json({ reviews, rating, page, pageSize, total: rating?.count ?? 0 })
}

export async function myReview(request, response) {
  const { id } = request.params
  if (!mongoose.isObjectIdOrHexString(id)) return response.status(400).json({ message: 'Choose a valid product.' })

  const user = request.user.id
  const [review, eligible] = await Promise.all([
    ProductReview.findOne({ user, product: id }).select('stars comment').lean(),
    hasDeliveredPurchase(user, id),
  ])
  response.json({ review, eligible })
}

export async function saveReview(request, response) {
  const { id } = request.params
  const { stars, comment } = request.body ?? {}
  const text = typeof comment === 'string' ? comment.trim() : ''
  if (!mongoose.isObjectIdOrHexString(id) || !Number.isInteger(stars) || stars < 1 || stars > 5 || !text || text.length > 1000) {
    return response.status(400).json({ message: 'Choose 1 to 5 stars and write a review of up to 1,000 characters.' })
  }
  if (!(await Product.exists({ _id: id, ...activeProducts }))) return response.status(404).json({ message: 'Product not found.' })
  const user = request.user.id
  if (!(await hasDeliveredPurchase(user, id))) return response.status(403).json({ message: 'You can review this product after receiving your order.' })

  const filter = { user, product: id }
  const update = { $set: { stars, comment: text } }
  try {
    await ProductReview.updateOne(filter, update, { upsert: true, runValidators: true })
  } catch (error) {
    if (error.code !== 11000) throw error
    await ProductReview.updateOne(filter, update, { runValidators: true })
  }
  response.sendStatus(204)
}

export async function deleteReview(request, response) {
  const { id } = request.params
  if (!mongoose.isObjectIdOrHexString(id)) return response.status(400).json({ message: 'Choose a valid product.' })
  await ProductReview.deleteOne({ user: request.user.id, product: id })
  response.sendStatus(204)
}
