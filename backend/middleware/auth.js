import User from '../models/User.js'
import { getActiveSession } from '../utils/session.js'

export async function requireUser(request, response, next) {
  response.set('Cache-Control', 'no-store')
  const loginSession = await getActiveSession(request)
  if (!loginSession) {
    return response.status(401).json({ message: 'Please log in to continue.' })
  }

  const user = await User.findById(loginSession.user).select('+passwordVersion')
  if (!user || (user.passwordVersion ?? 0) !== (loginSession.passwordVersion ?? 0)) {
    return response.status(401).json({ message: 'Please log in to continue.' })
  }

  request.user = user
  request.loginSession = loginSession
  next()
}

export function requireAdmin(request, response, next) {
  if (request.user.role !== 'admin') {
    return response.status(403).json({ message: 'Administrator access is required.' })
  }

  next()
}
