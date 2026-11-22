import mongoose from 'mongoose'

export const activeProducts = { archived: { $ne: true } }

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 150 },
    description: { type: String, required: true, trim: true, maxlength: 5000 },
    price: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    images: {
      type: [
        {
          type: String,
          trim: true,
          maxlength: 2048,
          match: /^https?:\/\/\S+$/i,
        },
      ],
      validate: {
        validator: (images) => images.length >= 1 && images.length <= 8,
        message: 'A product needs between 1 and 8 image URLs.',
      },
    },
    stock: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    featured: { type: Boolean, default: false },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true },
)

productSchema.index({ createdAt: -1, _id: -1 })
productSchema.index({ archived: 1, createdAt: -1, _id: -1 })
productSchema.index({ category: 1, createdAt: -1, _id: -1 })

const stockChangeSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  reason: { type: String, enum: ['initial', 'manual', 'order', 'cancellation', 'return'], required: true },
  quantityChange: { type: Number, required: true, validate: Number.isSafeInteger },
  stockAfter: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
}, { timestamps: { updatedAt: false } })

stockChangeSchema.index({ product: 1, createdAt: -1, _id: -1 })

export const StockChange = mongoose.model('StockChange', stockChangeSchema)

export default mongoose.model('Product', productSchema)
