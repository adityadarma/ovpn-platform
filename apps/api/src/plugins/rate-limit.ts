import fp from 'fastify-plugin'
import rateLimit from '@fastify/rate-limit'

export default fp(async (app) => {
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please try again in a minute.',
    }),
  })
})
