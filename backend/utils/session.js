import jwt from 'jsonwebtoken'

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

export function setSession(response, userId) {
  const token = jwt.sign({}, process.env.JWT_SECRET, {
    algorithm,
    issuer,
    subject: String(userId),
    expiresIn: sessionSeconds,
  })

  response.cookie(cookieName, token, { ...cookieOptions(), maxAge: sessionSeconds * 1000 })
}

export function clearSession(response) {
  response.clearCookie(cookieName, cookieOptions())
}

export function getSessionUserId(request) {
  const token = request.cookies[cookieName]
  if (!token) return null

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: [algorithm],
      issuer,
    })

    return payload.sub
  } catch {
    return null
  }
}
