export function readPage(value = '1') {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null
  const page = Number(value)
  return page >= 1 && page <= 1000 ? page : null
}

export function escapeSearch(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export const dayMs = 24 * 60 * 60 * 1000

export function readSriLankaDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const midnight = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(midnight.getTime()) || midnight.toISOString().slice(0, 10) !== value) return null
  return new Date(`${value}T00:00:00+05:30`)
}

export function readRupees(value, maxWholeDigits = 14) {
  if (typeof value !== 'string' || !/^\d{1,14}(\.\d{1,2})?$/.test(value)) return null
  const [rupees, cents = ''] = value.split('.')
  if (rupees.length > maxWholeDigits) return null
  const amount = Number(rupees) * 100 + Number(cents.padEnd(2, '0'))
  return Number.isSafeInteger(amount) ? amount : null
}
