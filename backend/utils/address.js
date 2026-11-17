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
