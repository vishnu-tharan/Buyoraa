import mongoose from 'mongoose'
import Category from '../models/Category.js'
import Product from '../models/Product.js'

export async function listCategories(request, response) {
  const categories = await Category.find().sort({ name: 1, _id: 1 })
  response.json({ categories })
}

export async function listProducts(request, response) {
  const { page = '1' } = request.query
  const pageNumber = Number(page)
  const pageSize = 24

  if (typeof page !== 'string' || !/^\d+$/.test(page) || pageNumber < 1 || pageNumber > 1000) {
    return response.status(400).json({ message: 'Page must be a whole number between 1 and 1000.' })
  }

  const [products, total] = await Promise.all([
    Product.find()
      .populate('category', 'name slug')
      .sort({ createdAt: -1, _id: -1 })
      .skip((pageNumber - 1) * pageSize)
      .limit(pageSize),
    Product.countDocuments(),
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
