import mongoose from 'mongoose'
import User from '../models/User.js'
import { getSessionUserId } from '../utils/session.js'

export async function requireUser(request, response, next) {
  response.set('Cache-Control', 'no-store')
  const userId = await getSessionUserId(request)

  if (!mongoose.isObjectIdOrHexString(userId)) {
    return response.status(401).json({ message: 'Please log in to continue.' })
  }

  const user = await User.findById(userId)
  if (!user) {
    return response.status(401).json({ message: 'Please log in to continue.' })
  }

  request.user = user
  next()
}

export function requireAdmin(request, response, next) {
  if (request.user.role !== 'admin') {
    return response.status(403).json({ message: 'Administrator access is required.' })
  }

  next()
}
