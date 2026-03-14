import type { FastifyPluginAsync } from 'fastify'
import { APP_VERSION } from '@ovpn/shared'

const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/health',
    {
      schema: {
        tags: ['health'],
        summary: 'Health check',
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              version: { type: 'string' },
              timestamp: { type: 'string' },
            },
          },
        },
      },
    },
    async () => ({
      status: 'ok',
      version: APP_VERSION,
      timestamp: new Date().toISOString(),
    }),
  )
}

export default healthRoutes
