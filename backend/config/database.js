import mongoose from 'mongoose'
import Category from '../models/Category.js'
import Order from '../models/Order.js'
import Product from '../models/Product.js'
import User from '../models/User.js'
import Wishlist from '../models/Wishlist.js'

export async function connectDatabase(uri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 })
  // Wait for unique indexes before accepting writes.
  await Promise.all([User.init(), Category.init(), Product.init(), Order.init(), Wishlist.init()])
}
