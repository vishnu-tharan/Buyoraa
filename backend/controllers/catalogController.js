import mongoose from 'mongoose'
import Category from '../models/Category.js'
import Product from '../models/Product.js'

export async function listCategories(request, response) {
  const categories = await Category.find().sort({ name: 1, _id: 1 })
  response.json({ categories })
}

export async function listProducts(request, response) {
  const { page = '1', category, featured } = request.query
  const pageNumber = Number(page)
  const pageSize = 24

  if (typeof page !== 'string' || !/^\d+$/.test(page) || pageNumber < 1 || pageNumber > 1000) {
    return response.status(400).json({ message: 'Page must be a whole number between 1 and 1000.' })
  }

  const filters = {}
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
      .sort({ createdAt: -1, _id: -1 })
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

  const product = await Product.findById(request.params.id).populate('category', 'name slug')
  if (!product) {
    return response.status(404).json({ message: 'Product not found.' })
  }

  response.json({ product })
}
