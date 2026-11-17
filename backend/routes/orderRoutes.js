import { Router } from 'express'
import { checkoutAttempt, listOrders, orderDetails, placeOrder } from '../controllers/orderController.js'
import { requireUser } from '../middleware/auth.js'

const router = Router()

router.use(requireUser)
router.get('/', listOrders)
router.post('/', placeOrder)
router.get('/checkout/:checkoutKey', checkoutAttempt)
router.get('/:id', orderDetails)

export default router
