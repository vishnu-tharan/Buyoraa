import mongoose from 'mongoose'
import Category from '../models/Category.js'
import Order from '../models/Order.js'
import Product, { ProductReview, StockChange } from '../models/Product.js'
import User, { LoginSession } from '../models/User.js'
import Wishlist from '../models/Wishlist.js'

export async function connectDatabase(uri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 })
  // Wait for unique indexes before accepting writes.
  await Promise.all([
    User.init(), LoginSession.init(), Category.init(), Product.init(), ProductReview.init(), StockChange.init(), Order.init(), Wishlist.init(),
  ])
}
