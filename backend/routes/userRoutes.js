import { Router } from 'express'
import mongoose from 'mongoose'
import { accountDetails } from '../controllers/authController.js'
import { requireUser } from '../middleware/auth.js'
import User from '../models/User.js'
import { readAddress, readPhone } from '../utils/address.js'

const router = Router()
const updateOptions = { returnDocument: 'after', runValidators: true }

router.use(requireUser)

router.patch('/profile', async (request, response) => {
  const { name, phone } = request.body ?? {}
  const cleanName = typeof name === 'string' ? name.trim() : ''
  const cleanPhone = typeof phone === 'string' && !phone.trim() ? '' : readPhone(phone)

  if (!cleanName || cleanName.length > 100 || cleanPhone === null) {
    return response.status(400).json({ message: 'Enter a valid name and phone number.' })
  }

  const user = await User.findByIdAndUpdate(
    request.user.id,
    { $set: { name: cleanName, phone: cleanPhone } },
    updateOptions,
  )
  if (!user) return response.status(404).json({ message: 'Account not found.' })
  response.json({ user: accountDetails(user) })
})

router.post('/addresses', async (request, response) => {
  const address = readAddress(request.body)
  if (!address) return response.status(400).json({ message: 'Complete all address fields.' })

  const user = await User.findOneAndUpdate(
    { _id: request.user.id, 'addresses.9': { $exists: false } },
    { $push: { addresses: address } },
    updateOptions,
  )
  if (!user) return response.status(409).json({ message: 'You can save up to 10 delivery addresses.' })
  response.status(201).json({ user: accountDetails(user) })
})

router.param('addressId', (request, response, next, id) => {
  if (!mongoose.isObjectIdOrHexString(id)) {
    return response.status(400).json({ message: 'Enter a valid address ID.' })
  }
  next()
})

router.patch('/addresses/:addressId', async (request, response) => {
  const address = readAddress(request.body)
  if (!address) return response.status(400).json({ message: 'Complete all address fields.' })

  const { addressId } = request.params
  const fields = Object.fromEntries(Object.entries(address).map(([key, value]) => [`addresses.$.${key}`, value]))
  const user = await User.findOneAndUpdate(
    { _id: request.user.id, 'addresses._id': addressId },
    { $set: fields },
    updateOptions,
  )
  if (!user) return response.status(404).json({ message: 'Address not found.' })
  response.json({ user: accountDetails(user) })
})

router.delete('/addresses/:addressId', async (request, response) => {
  const user = await User.findByIdAndUpdate(
    request.user.id,
    { $pull: { addresses: { _id: request.params.addressId } } },
    updateOptions,
  )
  if (!user) return response.status(404).json({ message: 'Account not found.' })
  response.json({ user: accountDetails(user) })
})

export default router
