import { randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { LoginSession } from '../models/User.js'

const cookieName = 'buyora_session'
const sessionSeconds = 24 * 60 * 60
const algorithm = 'HS256'
const issuer = 'buyora'

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api',
  }
}

export async function setSession(response, userId) {
  const sessionId = randomUUID()
  const expiresAt = new Date(Date.now() + sessionSeconds * 1000)
  const token = jwt.sign({}, process.env.JWT_SECRET, {
    algorithm,
    issuer,
    subject: String(userId),
    jwtid: sessionId,
    expiresIn: sessionSeconds,
  })

  await LoginSession.create({ _id: sessionId, user: userId, expiresAt })
  response.cookie(cookieName, token, { ...cookieOptions(), maxAge: sessionSeconds * 1000 })
}

export async function clearSession(request, response) {
  const session = readSession(request)
  if (session) await LoginSession.deleteOne({ _id: session.jti, user: session.sub })
  response.clearCookie(cookieName, cookieOptions())
}

function readSession(request) {
  const token = request.cookies[cookieName]
  if (!token) return null

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: [algorithm],
      issuer,
    })

    return typeof payload.jti === 'string' && typeof payload.sub === 'string' ? payload : null
  } catch {
    return null
  }
}

export async function getSessionUserId(request) {
  const session = readSession(request)
  if (!session) return null

  const activeSession = await LoginSession.exists({
    _id: session.jti,
    user: session.sub,
    expiresAt: { $gt: new Date() },
  })
  return activeSession ? session.sub : null
}
