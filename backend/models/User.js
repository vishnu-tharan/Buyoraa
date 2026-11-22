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
    passwordVersion: { type: Number, default: 0, select: false },
    checkoutVersion: { type: Number, select: false },
    role: { type: String, enum: ['customer', 'admin'], default: 'customer' },
    phone: { type: String, trim: true, maxlength: 30, default: '' },
    addresses: [addressSchema],
  },
  { timestamps: true },
)

const loginSessionSchema = new mongoose.Schema({
  _id: String,
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  passwordVersion: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true, expires: 0 },
})

export const LoginSession = mongoose.model('LoginSession', loginSessionSchema)

export default mongoose.model('User', userSchema)
