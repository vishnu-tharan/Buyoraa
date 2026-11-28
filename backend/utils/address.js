import { addressFields } from '../models/User.js'

export function readAddress(input) {
  const address = {}
  for (const [field, rules] of Object.entries(addressFields)) {
    const value = typeof input?.[field] === 'string' ? input[field].trim() : ''
    if (!value || value.length > rules.maxlength) return null
    address[field] = value
  }
  return address
}

export function readPhone(input) {
  const phone = typeof input === 'string' ? input.trim() : ''
  const digits = phone.replace(/\D/g, '')

  if (phone.length > 30 || !/^\+?[\d ()-]+$/.test(phone) || digits.length < 7 || digits.length > 15) {
    return null
  }

  return phone
}

export function readDeliveryDetails({ shippingAddress, deliveryInstructions = '' }) {
  const address = readAddress(shippingAddress)
  const name = typeof shippingAddress?.name === 'string' ? shippingAddress.name.trim() : ''
  const phone = readPhone(shippingAddress?.phone)
  if (!address || !name || name.length > 100 || !phone) {
    return { error: 'Enter a complete delivery address and a valid contact number.' }
  }
  if (typeof deliveryInstructions !== 'string' || deliveryInstructions.trim().length > 300) {
    return { error: 'Use up to 300 characters for delivery instructions.' }
  }
  return { delivery: { ...address, name, phone }, instructions: deliveryInstructions.trim() || undefined }
}
