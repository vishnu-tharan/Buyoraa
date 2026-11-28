import mongoose from 'mongoose'
import { addressFields } from './User.js'

export const orderStatuses = ['pending', 'confirmed', 'shipped', 'delivered', 'delivery_failed', 'returned', 'cancelled']

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

const deliveryEstimateSchema = new mongoose.Schema({
  minDays: { type: Number, required: true, min: 1, max: 60, validate: Number.isInteger },
  maxDays: { type: Number, required: true, min: 1, max: 60, validate: Number.isInteger },
}, { _id: false })

const adminNoteSchema = new mongoose.Schema({
  text: { type: String, required: true, trim: true, maxlength: 500 },
  author: { type: String, required: true, maxlength: 100 },
  createdAt: { type: Date, required: true },
})

const storeSettingsSchema = new mongoose.Schema({
  _id: String,
  deliveryEstimate: deliveryEstimateSchema,
})

const StoreSettings = mongoose.model('StoreSettings', storeSettingsSchema)

const discountCodeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  amount: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  minimumSubtotal: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  expiresAt: { type: Date, required: true },
  active: { type: Boolean, default: true },
}, { timestamps: true })

export const DiscountCode = mongoose.model('DiscountCode', discountCodeSchema)

export function readDiscountCode(value) {
  if (typeof value !== 'string') return null
  const code = value.trim().toUpperCase()
  return !code || /^[A-Z0-9][A-Z0-9-]{2,23}$/.test(code) ? code : null
}

export async function getDeliveryEstimate(session = null) {
  const settings = await StoreSettings.findById('store').session(session).lean()
  return settings?.deliveryEstimate ?? null
}

export function saveDeliveryEstimate(deliveryEstimate) {
  return StoreSettings.updateOne({ _id: 'store' }, { $set: { deliveryEstimate } }, { upsert: true, runValidators: true })
}

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
    deliveryInstructions: { type: String, trim: true, maxlength: 300 },
    deliveryEstimate: deliveryEstimateSchema,
    adminNotes: { type: [adminNoteSchema], select: false, default: undefined },
    subtotal: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    shippingFee: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    discountCode: String,
    discountAmount: { type: Number, min: 0, validate: Number.isSafeInteger },
    totalAmount: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    checkoutKey: { type: String, immutable: true, select: false },
    checkoutFingerprint: { type: String, immutable: true, select: false },
    paymentMethod: { type: String, enum: ['cash_on_delivery'], default: 'cash_on_delivery' },
    paymentStatus: { type: String, enum: ['pending', 'paid'], default: 'pending' },
    paidAt: Date,
    returnRestocked: { type: Boolean, select: false },
    orderStatus: {
      type: String,
      enum: orderStatuses,
      default: 'pending',
    },
  },
  { timestamps: true },
)

orderSchema.index({ user: 1, createdAt: -1, _id: -1 })
orderSchema.index({ createdAt: -1, _id: -1 })
orderSchema.index({ orderStatus: 1, createdAt: -1, _id: -1 })
orderSchema.index(
  { user: 1, checkoutKey: 1 },
  { unique: true, partialFilterExpression: { checkoutKey: { $type: 'string' } } },
)

export default mongoose.model('Order', orderSchema)
