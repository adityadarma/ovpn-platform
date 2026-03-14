import type { FastifyPluginAsync } from 'fastify'

const settingsRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/v1/settings
  app.get(
    '/settings',
    { onRequest: [app.authenticate], schema: { tags: ['settings'], summary: 'Get platform settings', security: [{ bearerAuth: [] }] } },
    async () => app.db('settings').select('*').orderBy('key', 'asc'),
  )

  // POST /api/v1/settings  (bulk update)
  app.post(
    '/settings',
    { onRequest: [app.authenticateAdmin], schema: { tags: ['settings'], summary: 'Update platform settings', security: [{ bearerAuth: [] }] } },
    async (request, reply) => {
      const updates = request.body as Record<string, string>

      for (const [key, value] of Object.entries(updates)) {
        await app.db('settings')
          .where({ key })
          .update({ value, updated_at: new Date() })
      }

      return reply.send({ ok: true })
    },
  )
}

export default settingsRoutes
