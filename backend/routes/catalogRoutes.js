import { Router } from 'express'
import { deleteReview, getProduct, listCategories, listProducts, listReviews, myReview, recentProducts, saveReview } from '../controllers/catalogController.js'
import { requireUser } from '../middleware/auth.js'

const router = Router()

router.get('/categories', listCategories)
router.get('/products', listProducts)
router.get('/products/recent', recentProducts)
router.get('/products/:id', getProduct)
router.get('/products/:id/reviews', listReviews)
router.get('/products/:id/reviews/mine', requireUser, myReview)
router.put('/products/:id/reviews/mine', requireUser, saveReview)
router.delete('/products/:id/reviews/mine', requireUser, deleteReview)

export default router
