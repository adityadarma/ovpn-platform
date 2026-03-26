import fp from 'fastify-plugin'
import fastifyStatic from '@fastify/static'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default fp(async (app) => {
  // In production, Next.js static output is placed at /app/web
  // In development, this plugin is not loaded (dev uses `next dev`)
  const webRoot = process.env['WEB_STATIC_PATH'] ?? path.resolve(__dirname, '../../../web')

  await app.register(fastifyStatic, {
    root: webRoot,
    // Serve static assets (JS, CSS, images) without prefix
    prefix: '/',
    // Don't decorate reply — we'll handle fallback manually
    decorateReply: false,
  })

  // SPA fallback: all non-API, non-asset routes → index.html
  app.setNotFoundHandler(async (request, reply) => {
    const { url } = request
    // Pass through /api/* — should never reach here but just in case
    if (url.startsWith('/api/')) {
      return reply.status(404).send({ error: 'Not Found' })
    }
    return reply.sendFile('index.html', webRoot)
  })
})
