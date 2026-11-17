import mongoose from 'mongoose'

export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const addressFields = {
  street: { type: String, required: true, trim: true, maxlength: 200 },
  city: { type: String, required: true, trim: true, maxlength: 100 },
  postalCode: { type: String, required: true, trim: true, maxlength: 20 },
  country: { type: String, required: true, trim: true, maxlength: 100 },
}

const addressSchema = new mongoose.Schema(addressFields)

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
      match: emailPattern,
      unique: true,
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['customer', 'admin'], default: 'customer' },
    phone: { type: String, trim: true, maxlength: 30, default: '' },
    addresses: [addressSchema],
  },
  { timestamps: true },
)

export default mongoose.model('User', userSchema)
