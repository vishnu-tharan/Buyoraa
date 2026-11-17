import mongoose from 'mongoose'
import { addressFields } from './User.js'

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true, trim: true, maxlength: 150 },
    price: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    quantity: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  },
  { _id: false },
)

const shippingAddressSchema = new mongoose.Schema(
  {
    ...addressFields,
    name: { type: String, required: true, trim: true, maxlength: 100 },
    phone: { type: String, required: true, trim: true, maxlength: 30 },
  },
  { _id: false },
)

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    orderItems: {
      type: [orderItemSchema],
      validate: {
        validator: (items) => items.length > 0,
        message: 'An order needs at least one item.',
      },
    },
    shippingAddress: { type: shippingAddressSchema, required: true },
    subtotal: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    shippingFee: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    totalAmount: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    checkoutKey: { type: String, immutable: true, select: false },
    checkoutFingerprint: { type: String, immutable: true, select: false },
    paymentMethod: { type: String, enum: ['cash_on_delivery'], default: 'cash_on_delivery' },
    paymentStatus: { type: String, enum: ['pending', 'paid'], default: 'pending' },
    orderStatus: {
      type: String,
      enum: ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'],
      default: 'pending',
    },
  },
  { timestamps: true },
)

orderSchema.index({ user: 1, createdAt: -1, _id: -1 })
orderSchema.index(
  { user: 1, checkoutKey: 1 },
  { unique: true, partialFilterExpression: { checkoutKey: { $type: 'string' } } },
)

export default mongoose.model('Order', orderSchema)
