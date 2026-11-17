export function handleError(error, request, response, next) {
  if (response.headersSent) return next(error)

  if (error.code === 20 && error.name === 'MongoServerError') {
    return response.status(503).json({ message: 'This change requires a MongoDB replica set.' })
  }

  if (error.type === 'entity.parse.failed') {
    return response.status(400).json({ message: 'The request body must contain valid JSON.' })
  }

  if (error.type === 'entity.too.large') {
    return response.status(413).json({ message: 'The request body is too large.' })
  }

  if (error.name === 'ValidationError' || error.name === 'CastError') {
    return response.status(400).json({ message: 'Check the submitted information and try again.' })
  }

  if (error.status >= 400 && error.status < 500) {
    return response.status(error.status).json({ message: 'Buyora could not read this request.' })
  }

  console.error(`Request failed: ${error.name}`)
  response.status(500).json({ message: 'Something went wrong. Please try again.' })
}
