import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import User, { emailPattern, LoginSession } from '../models/User.js'
import { clearSession, createSession, setSessionCookie } from '../utils/session.js'

const passwordCost = 12
const fallbackHash = bcrypt.hashSync('unused login comparison', passwordCost)
const sessionEnded = new Error('The current session ended before the password was changed.')

function getEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function validEmail(email) {
  return email.length <= 254 && emailPattern.test(email)
}

function validPassword(password) {
  return typeof password === 'string' && password.length >= 8 && !bcrypt.truncates(password)
}

export function accountDetails(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone,
    addresses: user.addresses,
    defaultAddressId: user.defaultAddressId ?? null,
  }
}

export async function register(request, response) {
  const { name, email, password } = request.body ?? {}
  const cleanName = typeof name === 'string' ? name.trim() : ''
  const cleanEmail = getEmail(email)

  if (!cleanName || cleanName.length > 100) {
    return response.status(400).json({ message: 'Enter a name of 1 to 100 characters.' })
  }

  if (!validEmail(cleanEmail)) {
    return response.status(400).json({ message: 'Enter a valid email address.' })
  }

  if (!validPassword(password)) {
    return response.status(400).json({ message: 'Use a password of at least 8 characters and at most 72 bytes.' })
  }

  const passwordHash = await bcrypt.hash(password, passwordCost)

  try {
    await User.create({ name: cleanName, email: cleanEmail, passwordHash })
  } catch (error) {
    if (error.code !== 11000) throw error
  }

  response.sendStatus(204)
}

export async function login(request, response) {
  const { email, password } = request.body ?? {}
  const cleanEmail = getEmail(email)
  const incorrectLogin = { message: 'Email or password is incorrect.' }

  if (!validEmail(cleanEmail) || !validPassword(password)) {
    return response.status(401).json(incorrectLogin)
  }

  const user = await User.findOne({ email: cleanEmail }).select('+passwordHash +passwordVersion')
  const passwordMatches = await bcrypt.compare(password, user?.passwordHash ?? fallbackHash)

  if (!user || !passwordMatches) {
    return response.status(401).json(incorrectLogin)
  }

  setSessionCookie(response, await createSession(user.id, user.passwordVersion ?? 0))
  response.json({ user: accountDetails(user) })
}

export async function changePassword(request, response) {
  const { currentPassword, newPassword } = request.body ?? {}
  if (!validPassword(currentPassword)) {
    return response.status(400).json({ message: 'Enter your current password.' })
  }
  if (!validPassword(newPassword)) {
    return response.status(400).json({ message: 'Use a new password of at least 8 characters and at most 72 bytes.' })
  }

  const version = request.loginSession.passwordVersion ?? 0
  const account = { _id: request.user.id, passwordVersion: version === 0 ? { $in: [0, null] } : version }
  const user = await User.findOne(account).select('+passwordHash')
  if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return response.status(400).json({ message: 'Your current password is incorrect.' })
  }
  if (currentPassword === newPassword) {
    return response.status(400).json({ message: 'Choose a password different from your current one.' })
  }

  const passwordHash = await bcrypt.hash(newPassword, passwordCost)
  let token
  try {
    token = await mongoose.connection.transaction(async (session) => {
      const updated = await User.updateOne(
        { ...account, passwordHash: user.passwordHash },
        { $set: { passwordHash, passwordVersion: version + 1 } },
        { session },
      )
      if (!updated.matchedCount) return null

      const removed = await LoginSession.deleteOne({ _id: request.loginSession._id, expiresAt: { $gt: new Date() } }, { session })
      if (!removed.deletedCount) throw sessionEnded

      // Only the replacement session gets the new password version. Old sessions expire automatically.
      return createSession(user.id, version + 1, session)
    })
  } catch (error) {
    if (error !== sessionEnded) throw error
  }

  if (!token) return response.status(401).json({ message: 'Your session has ended. Sign in again to change your password.' })

  setSessionCookie(response, token)
  response.sendStatus(204)
}

export function currentUser(request, response) {
  response.json({ user: accountDetails(request.user) })
}

export async function logout(request, response) {
  await clearSession(request, response)
  response.sendStatus(204)
}
