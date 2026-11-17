import 'dotenv/config'
import mongoose from 'mongoose'
import { connectDatabase } from '../config/database.js'
import Category from '../models/Category.js'
import Product from '../models/Product.js'

const categories = [
  { name: 'Home & Living', slug: 'home-and-living', description: 'Practical items for your home and workspace.' },
  { name: 'Electronics', slug: 'electronics', description: 'Everyday audio and desk accessories.' },
  { name: 'Style', slug: 'style', description: 'Shoes and accessories for everyday wear.' },
  { name: 'Travel & Outdoors', slug: 'travel-and-outdoors', description: 'Essentials for commutes, trips, and days outside.' },
]

const products = [
  {
    _id: '64f0b7090000000000000001',
    name: 'Wireless Over-Ear Headphones',
    category: 'electronics',
    description: 'Wireless over-ear headphones with cushioned cups and an adjustable headband for music, calls, and study sessions.',
    price: 1290000,
    stock: 18,
    featured: true,
    photo: '1505740420928-5e560c06d30e',
  },
  {
    _id: '64f0b7090000000000000002',
    name: 'Adjustable Desk Lamp',
    category: 'home-and-living',
    description: 'A compact desk lamp with a movable head for reading, working, or lighting a bedside table.',
    price: 549000,
    stock: 14,
    featured: true,
    photo: '1507473885765-e6ed057f782c',
  },
  {
    _id: '64f0b7090000000000000003',
    name: 'Everyday Low-Top Sneakers',
    category: 'style',
    description: 'Low-top lace-up sneakers with a cushioned collar and a rubber sole for everyday wear.',
    price: 975000,
    stock: 12,
    featured: true,
    photo: '1549298916-b41d501d3772',
  },
  {
    _id: '64f0b7090000000000000004',
    name: 'Commuter Backpack',
    category: 'travel-and-outdoors',
    description: 'A day backpack with adjustable shoulder straps and a front pocket for keys, cables, and other small items.',
    price: 745000,
    stock: 21,
    featured: true,
    photo: '1553062407-98eeb64c6a62',
  },
  {
    _id: '64f0b7090000000000000005',
    name: 'Ceramic Coffee Mug',
    category: 'home-and-living',
    description: 'A ceramic mug with a generous handle for coffee, tea, or hot chocolate.',
    price: 195000,
    stock: 26,
    featured: false,
    photo: '1514228742587-6b1558fcca3d',
  },
  {
    _id: '64f0b7090000000000000006',
    name: 'Compact Desk Keyboard',
    category: 'electronics',
    description: 'A compact keyboard that leaves more space for a mouse and notebook on smaller desks.',
    price: 895000,
    stock: 9,
    featured: false,
    photo: '1587829741301-dc798b83add3',
  },
  {
    _id: '64f0b7090000000000000007',
    name: 'Minimal Dial Watch',
    category: 'style',
    description: 'An everyday wristwatch with a clean analogue dial and an adjustable strap.',
    price: 679000,
    stock: 0,
    featured: false,
    photo: '1523275335684-37898b6baf30',
  },
  {
    _id: '64f0b7090000000000000008',
    name: 'Reusable Water Bottle',
    category: 'travel-and-outdoors',
    description: 'A reusable bottle with a screw-top lid for commuting, training, or a day outside.',
    price: 329000,
    stock: 24,
    featured: false,
    photo: '1602143407151-7111542de6e8',
  },
]

async function seedCatalog() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is missing.')

  await connectDatabase(process.env.MONGODB_URI)
  const categoryIds = new Map()

  for (const category of categories) {
    const saved = await Category.findOneAndUpdate(
      { slug: category.slug },
      { $setOnInsert: category },
      { upsert: true, returnDocument: 'after' },
    )
    categoryIds.set(category.slug, saved._id)
  }

  let added = 0
  const now = Date.now()
  for (const [index, product] of products.entries()) {
    const { _id, category, photo, ...details } = product
    const createdAt = new Date(now - (products.length - index) * 86400000)
    const fields = {
      ...details,
      category: categoryIds.get(category),
      images: [`https://images.unsplash.com/photo-${photo}?auto=format&fit=crop&w=900&q=82`],
      createdAt,
      updatedAt: createdAt,
    }
    const result = await Product.updateOne(
      { _id },
      { $setOnInsert: fields },
      { upsert: true, timestamps: false, runValidators: true },
    )
    added += result.upsertedCount
  }

  console.log(`Sample catalog ready. Added ${added} products to "${mongoose.connection.name}".`)
}

try {
  await seedCatalog()
} catch (error) {
  console.error(`Could not seed the catalog (${error.name}). Check MONGODB_URI and retry.`)
  process.exitCode = 1
} finally {
  await mongoose.disconnect()
}
