import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { currentUser, login, logout, register } from '../controllers/authController.js'
import { requireUser } from '../middleware/auth.js'

const router = Router()
const limitLoginAttempts = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many attempts. Try again in 15 minutes.' },
})

router.use((request, response, next) => {
  response.set('Cache-Control', 'no-store')
  next()
})

router.post('/register', limitLoginAttempts, register)
router.post('/login', limitLoginAttempts, login)
router.post('/logout', logout)
router.get('/me', requireUser, currentUser)

export default router
