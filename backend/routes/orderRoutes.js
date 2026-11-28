import { Router } from 'express'
import { cancelOrder, checkoutAttempt, listOrders, orderDetails, placeOrder, updateDelivery } from '../controllers/orderController.js'
import { requireUser } from '../middleware/auth.js'

const router = Router()

router.use(requireUser)
router.get('/', listOrders)
router.post('/', placeOrder)
router.get('/checkout/:checkoutKey', checkoutAttempt)
router.get('/:id', orderDetails)
router.patch('/:id/cancel', cancelOrder)
router.patch('/:id/delivery', updateDelivery)

export default router
