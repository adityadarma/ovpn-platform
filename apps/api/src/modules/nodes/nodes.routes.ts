import type { FastifyPluginAsync } from 'fastify'
import crypto from 'node:crypto'
import { RegisterNodeSchema, HeartbeatSchema } from '@ovpn/shared'

const nodeRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/v1/nodes
  app.get(
    '/nodes',
    { onRequest: [app.authenticate], schema: { tags: ['nodes'], summary: 'List all VPN nodes', security: [{ bearerAuth: [] }] } },
    async () => app.db('vpn_nodes').select('id', 'hostname', 'ip_address', 'port', 'region', 'status', 'version', 'last_seen', 'created_at'),
  )

  // GET /api/v1/nodes/:id
  app.get<{ Params: { id: string } }>(
    '/nodes/:id',
    { onRequest: [app.authenticate], schema: { tags: ['nodes'], summary: 'Get node by ID', security: [{ bearerAuth: [] }] } },
    async (request, reply) => {
      const node = await app.db('vpn_nodes').where({ id: request.params.id }).first()
      if (!node) return reply.status(404).send({ error: 'Not Found', message: 'Node not found' })
      const { token: _token, ...safeNode } = node
      return safeNode
    },
  )

  // POST /api/v1/nodes/register  (called by agent)
  app.post(
    '/nodes/register',
    { schema: { tags: ['nodes'], summary: 'Register a new VPN node (agent)' } },
    async (request, reply) => {
      const input = RegisterNodeSchema.parse(request.body)
      const token = crypto.randomBytes(32).toString('hex')

      const [id] = await app.db('vpn_nodes').insert({
        hostname: input.hostname,
        ip_address: input.ip,
        port: input.port ?? 1194,
        region: input.region ?? null,
        token,
        version: input.version,
        status: 'online',
        last_seen: new Date(),
      })

      return reply.status(201).send({
        id,
        token, // Returned ONCE — agent must store it securely
        message: 'Node registered successfully',
      })
    },
  )

  // POST /api/v1/nodes/heartbeat  (called by agent)
  app.post(
    '/nodes/heartbeat',
    { schema: { tags: ['nodes'], summary: 'Agent heartbeat' } },
    async (request) => {
      const { nodeId } = HeartbeatSchema.parse(request.body)
      await app.db('vpn_nodes').where({ id: nodeId }).update({ status: 'online', last_seen: new Date() })
      return { ok: true }
    },
  )

  // GET /api/v1/nodes/:id/tasks  (polled by agent)
  app.get<{ Params: { id: string } }>(
    '/nodes/:id/tasks',
    { schema: { tags: ['nodes'], summary: 'Poll pending tasks for a node (agent)' } },
    async (request) => {
      const tasks = await app.db('tasks')
        .where({ node_id: request.params.id, status: 'pending' })
        .orderBy('created_at', 'asc')
        .select('id', 'action', 'payload', 'created_at')

      // Mark as running
      const ids = tasks.map((t: { id: string }) => t.id)
      if (ids.length > 0) {
        await app.db('tasks').whereIn('id', ids).update({ status: 'running' })
      }

      return { tasks }
    },
  )

  // DELETE /api/v1/nodes/:id
  app.delete<{ Params: { id: string } }>(
    '/nodes/:id',
    { onRequest: [app.authenticateAdmin], schema: { tags: ['nodes'], summary: 'Remove a VPN node', security: [{ bearerAuth: [] }] } },
    async (request, reply) => {
      const deleted = await app.db('vpn_nodes').where({ id: request.params.id }).delete()
      if (!deleted) return reply.status(404).send({ error: 'Not Found', message: 'Node not found' })
      return reply.status(204).send()
    },
  )
}

export default nodeRoutes
