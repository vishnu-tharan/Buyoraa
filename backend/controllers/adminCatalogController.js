import mongoose from 'mongoose'
import Category from '../models/Category.js'
import Product, { activeProducts } from '../models/Product.js'
import { readPage } from '../utils/query.js'

function readText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function validImage(value) {
  if (typeof value !== 'string' || value.length > 2048 || /\s/.test(value)) return false

  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && /^https?:\/\//i.test(value)
      && !url.username && !url.password
  } catch {
    return false
  }
}

function productFields(input = {}) {
  const name = readText(input.name)
  const description = readText(input.description)
  const { price, stock, category, featured = false, images } = input

  if (!name || name.length > 150 || !description || description.length > 5000
    || !mongoose.isObjectIdOrHexString(category) || !Number.isSafeInteger(price) || price < 0
    || !Number.isSafeInteger(stock) || stock < 0 || typeof featured !== 'boolean'
    || !Array.isArray(images) || images.length < 1 || images.length > 8 || !images.every(validImage)) return null

  return { name, description, price, stock, category, featured, images }
}

function categoryFields(input = {}) {
  const name = readText(input.name)
  const slug = readText(input.slug).toLowerCase()
  const description = readText(input.description)

  if (!name || name.length > 100 || slug.length > 100 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
    || description.length > 500) return null

  return { name, slug, description }
}

export async function adminProducts(request, response) {
  const { page: requestedPage, lowStock } = request.query
  const page = readPage(requestedPage)
  if (!page) return response.status(400).json({ message: 'Enter a valid page number.' })
  if (lowStock !== undefined && lowStock !== 'true' && lowStock !== 'false') {
    return response.status(400).json({ message: 'Low stock must be true or false.' })
  }

  const filters = { ...activeProducts }
  if (lowStock === 'true') filters.stock = { $gte: 1, $lte: 5 }

  const pageSize = 20
  const [products, total] = await Promise.all([
    Product.find(filters)
      .populate('category', 'name')
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    Product.countDocuments(filters),
  ])

  response.json({ products, page, pageSize, total })
}

export async function adminProduct(request, response) {
  const product = await Product.findOne({ _id: request.params.id, ...activeProducts }).lean()
  if (!product) return response.status(404).json({ message: 'Product not found.' })
  response.json({ product })
}

async function lockCategory(id, session) {
  // Product writes and category deletion both update the category inside their transactions.
  const result = await Category.updateOne({ _id: id }, { $inc: { __v: 1 } }, { session })
  return result.matchedCount === 1
}

export async function saveProduct(request, response) {
  const fields = productFields(request.body ?? {})
  if (!fields) return response.status(400).json({ message: 'Enter a name, description, category, valid prices and stock, and 1 to 8 image URLs.' })

  const { id } = request.params
  const version = request.body.version
  if (id && (!Number.isSafeInteger(version) || version < 0)) {
    return response.status(400).json({ message: 'Reload the product before editing it.' })
  }

  const result = await mongoose.connection.transaction(async (session) => {
    if (id) {
      const current = await Product.findOne({ _id: id, ...activeProducts }).select('__v').session(session).lean()
      if (!current) return { status: 404, message: 'Product not found.' }
      if ((current.__v ?? 0) !== version) {
        return { status: 409, message: 'This product or its stock has changed. Reload it before saving.' }
      }
    }

    if (!(await lockCategory(fields.category, session))) {
      return { status: 400, message: 'Choose an existing category.' }
    }

    if (!id) {
      const [product] = await Product.create([fields], { session })
      return { product, status: 201 }
    }

    const product = await Product.findByIdAndUpdate(
      id, { $set: fields, $inc: { __v: 1 } },
      { session, runValidators: true, returnDocument: 'after' },
    )
    return { product, status: 200 }
  })

  response.status(result.status).json(result.message ? { message: result.message } : { product: result.product })
}

export async function deleteProduct(request, response) {
  const result = await Product.updateOne(
    { _id: request.params.id, ...activeProducts },
    { $set: { archived: true }, $inc: { __v: 1 } },
  )
  if (!result.matchedCount) return response.status(404).json({ message: 'Product not found.' })
  response.sendStatus(204)
}

export async function saveCategory(request, response) {
  const fields = categoryFields(request.body ?? {})
  if (!fields) return response.status(400).json({ message: 'Enter a name and a slug using letters, numbers, and hyphens.' })

  try {
    const { id } = request.params
    const category = id
      ? await Category.findByIdAndUpdate(id, fields, { runValidators: true, returnDocument: 'after' })
      : await Category.create(fields)
    if (!category) return response.status(404).json({ message: 'Category not found.' })
    response.status(id ? 200 : 201).json({ category })
  } catch (error) {
    if (error.code !== 11000) throw error
    response.status(409).json({ message: 'That category slug is already in use.' })
  }
}

export async function deleteCategory(request, response) {
  const { id } = request.params
  const result = await mongoose.connection.transaction(async (session) => {
    if (!(await lockCategory(id, session))) return { status: 404, message: 'Category not found.' }
    if (await Product.exists({ category: id, ...activeProducts }).session(session)) {
      return { status: 409, message: 'Move or remove products in this category before deleting it.' }
    }

    await Category.deleteOne({ _id: id }, { session })
    return { status: 204 }
  })

  if (result.message) return response.status(result.status).json({ message: result.message })
  response.sendStatus(204)
}
