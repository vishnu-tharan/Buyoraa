import mongoose from 'mongoose'

const categorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  slug: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    maxlength: 100,
    unique: true,
    match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  },
  description: { type: String, trim: true, maxlength: 500, default: '' },
})

export default mongoose.model('Category', categorySchema)
