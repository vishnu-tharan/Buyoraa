import { Router } from 'express'
import mongoose from 'mongoose'
import {
  adminDeliveryEstimate, adminDiscounts, adminOverview, adminUsers, createDiscount, disableDiscount, updateDeliveryEstimate,
} from '../controllers/adminController.js'
import {
  adminProduct, adminProducts, adminStockHistory, deleteCategory, deleteProduct, restoreProduct, saveCategory, saveProduct,
} from '../controllers/adminCatalogController.js'
import { addOrderNote, adminOrder, adminOrders, exportAdminOrders, updateOrderStatus } from '../controllers/adminOrdersController.js'
import { requireAdmin, requireUser } from '../middleware/auth.js'

const router = Router()

router.use(requireUser, requireAdmin)
router.param('id', (request, response, next, id) => {
  if (!mongoose.isObjectIdOrHexString(id)) return response.status(400).json({ message: 'Enter a valid ID.' })
  next()
})

router.get('/overview', adminOverview)
router.get('/delivery-estimate', adminDeliveryEstimate)
router.put('/delivery-estimate', updateDeliveryEstimate)
router.get('/discounts', adminDiscounts)
router.post('/discounts', createDiscount)
router.patch('/discounts/:id/disable', disableDiscount)
router.get('/users', adminUsers)
router.get('/products', adminProducts)
router.get('/products/:id', adminProduct)
router.get('/products/:id/stock-history', adminStockHistory)
router.post('/products', saveProduct)
router.put('/products/:id', saveProduct)
router.patch('/products/:id/restore', restoreProduct)
router.delete('/products/:id', deleteProduct)
router.post('/categories', saveCategory)
router.put('/categories/:id', saveCategory)
router.delete('/categories/:id', deleteCategory)
router.get('/orders', adminOrders)
router.get('/orders/export', exportAdminOrders)
router.get('/orders/:id', adminOrder)
router.patch('/orders/:id/status', updateOrderStatus)
router.post('/orders/:id/notes', addOrderNote)

export default router
