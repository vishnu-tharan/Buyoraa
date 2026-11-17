export function readPage(value = '1') {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null
  const page = Number(value)
  return page >= 1 && page <= 1000 ? page : null
}

export function escapeSearch(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
