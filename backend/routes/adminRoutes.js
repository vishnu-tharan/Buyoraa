import { Router } from 'express'
import mongoose from 'mongoose'
import { adminOverview, adminUsers } from '../controllers/adminController.js'
import {
  adminProduct, adminProducts, deleteCategory, deleteProduct, saveCategory, saveProduct,
} from '../controllers/adminCatalogController.js'
import { adminOrder, adminOrders, updateOrderStatus } from '../controllers/adminOrdersController.js'
import { requireAdmin, requireUser } from '../middleware/auth.js'

const router = Router()

router.use(requireUser, requireAdmin)
router.param('id', (request, response, next, id) => {
  if (!mongoose.isObjectIdOrHexString(id)) return response.status(400).json({ message: 'Enter a valid ID.' })
  next()
})

router.get('/overview', adminOverview)
router.get('/users', adminUsers)
router.get('/products', adminProducts)
router.get('/products/:id', adminProduct)
router.post('/products', saveProduct)
router.put('/products/:id', saveProduct)
router.delete('/products/:id', deleteProduct)
router.post('/categories', saveCategory)
router.put('/categories/:id', saveCategory)
router.delete('/categories/:id', deleteCategory)
router.get('/orders', adminOrders)
router.get('/orders/:id', adminOrder)
router.patch('/orders/:id/status', updateOrderStatus)

export default router
