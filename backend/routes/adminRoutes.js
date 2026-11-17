import { Router } from 'express'
import { requireAdmin, requireUser } from '../middleware/auth.js'
import User from '../models/User.js'

const router = Router()

router.get('/users', requireUser, requireAdmin, async (request, response) => {
  const { page = '1' } = request.query
  const pageNumber = Number(page)
  const pageSize = 50

  if (typeof page !== 'string' || !/^\d+$/.test(page) || pageNumber < 1 || pageNumber > 1000) {
    return response.status(400).json({ message: 'Page must be a whole number between 1 and 1000.' })
  }

  const users = await User.find({ role: 'customer' })
    .select('name email createdAt')
    .sort({ createdAt: -1, _id: -1 })
    .skip((pageNumber - 1) * pageSize)
    .limit(pageSize)

  response.json({ users, page: pageNumber, pageSize })
})

export default router
