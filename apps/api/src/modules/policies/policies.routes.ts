import type { FastifyPluginAsync } from 'fastify'
import { CreatePolicySchema } from '@ovpn/shared'

const policyRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/v1/policies
  app.get(
    '/policies',
    { onRequest: [app.authenticate], schema: { tags: ['policies'], summary: 'List all network policies', security: [{ bearerAuth: [] }] } },
    async () => app.db('vpn_policies').select('*').orderBy('priority', 'asc'),
  )

  // POST /api/v1/policies
  app.post(
    '/policies',
    { onRequest: [app.authenticateAdmin], schema: { tags: ['policies'], summary: 'Create a network policy', security: [{ bearerAuth: [] }] } },
    async (request, reply) => {
      const input = CreatePolicySchema.parse(request.body)

      const [id] = await app.db('vpn_policies').insert({
        user_id: input.userId,
        allowed_network: input.allowedNetwork,
        action: input.action ?? 'allow',
        priority: input.priority ?? 100,
        description: input.description ?? null,
      })

      return reply.status(201).send(await app.db('vpn_policies').where({ id }).first())
    },
  )

  // DELETE /api/v1/policies/:id
  app.delete<{ Params: { id: string } }>(
    '/policies/:id',
    { onRequest: [app.authenticateAdmin], schema: { tags: ['policies'], summary: 'Delete a network policy', security: [{ bearerAuth: [] }] } },
    async (request, reply) => {
      const deleted = await app.db('vpn_policies').where({ id: request.params.id }).delete()
      if (!deleted) return reply.status(404).send({ error: 'Not Found', message: 'Policy not found' })
      return reply.status(204).send()
    },
  )
}

export default policyRoutes
