import fp from 'fastify-plugin'
import fastifyCookie from '@fastify/cookie'

export default fp(async (app) => {
  await app.register(fastifyCookie)
})
