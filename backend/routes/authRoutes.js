import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { changePassword, currentUser, login, logout, register } from '../controllers/authController.js'
import { requireUser } from '../middleware/auth.js'

const router = Router()
const limitLoginAttempts = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many attempts. Try again in 15 minutes.' },
})
const limitPasswordChanges = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  keyGenerator: (request) => request.user.id,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many password change attempts. Try again in 15 minutes.' },
})

router.use((request, response, next) => {
  response.set('Cache-Control', 'no-store')
  next()
})

router.post('/register', limitLoginAttempts, register)
router.post('/login', limitLoginAttempts, login)
router.post('/logout', logout)
router.get('/me', requireUser, currentUser)
router.patch('/password', requireUser, limitPasswordChanges, changePassword)

export default router
