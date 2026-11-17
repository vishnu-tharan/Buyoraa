import bcrypt from 'bcryptjs'
import User, { emailPattern } from '../models/User.js'
import { clearSession, setSession } from '../utils/session.js'

const passwordCost = 12
const fallbackHash = bcrypt.hashSync('unused login comparison', passwordCost)

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
  let user

  try {
    user = await User.create({ name: cleanName, email: cleanEmail, passwordHash })
  } catch (error) {
    if (error.code === 11000) {
      return response.status(409).json({ message: 'An account already exists for that email.' })
    }

    throw error
  }

  setSession(response, user.id)
  response.status(201).json({ user: accountDetails(user) })
}

export async function login(request, response) {
  const { email, password } = request.body ?? {}
  const cleanEmail = getEmail(email)
  const incorrectLogin = { message: 'Email or password is incorrect.' }

  if (!validEmail(cleanEmail) || !validPassword(password)) {
    return response.status(401).json(incorrectLogin)
  }

  const user = await User.findOne({ email: cleanEmail }).select('+passwordHash')
  const passwordMatches = await bcrypt.compare(password, user?.passwordHash ?? fallbackHash)

  if (!user || !passwordMatches) {
    return response.status(401).json(incorrectLogin)
  }

  setSession(response, user.id)
  response.json({ user: accountDetails(user) })
}

export function currentUser(request, response) {
  response.json({ user: accountDetails(request.user) })
}

export function logout(request, response) {
  clearSession(response)
  response.sendStatus(204)
}
