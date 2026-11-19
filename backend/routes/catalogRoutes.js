import { Router } from 'express'
import { getProduct, listCategories, listProducts, recentProducts } from '../controllers/catalogController.js'

const router = Router()

router.get('/categories', listCategories)
router.get('/products', listProducts)
router.get('/products/recent', recentProducts)
router.get('/products/:id', getProduct)

export default router
