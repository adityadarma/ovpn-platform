import fp from 'fastify-plugin'
import cors from '@fastify/cors'

export default fp(async (app) => {
  await app.register(cors, {
    origin: process.env['WEB_URL'] ?? '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
})
