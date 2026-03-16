import type { FastifyPluginAsync } from 'fastify'
import { TaskResultSchema } from '@ovpn/shared'

const taskRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/v1/tasks  — list all tasks
  app.get(
    '/tasks',
    { onRequest: [app.authenticate], schema: { tags: ['tasks'], summary: 'List all tasks', security: [{ bearerAuth: [] }] } },
    async (request) => {
      const query = request.query as { nodeId?: string; status?: string }
      const builder = app.db('tasks as t')
        .join('vpn_nodes as n', 't.node_id', 'n.id')
        .select('t.*', 'n.hostname as node_hostname')
        .orderBy('t.created_at', 'desc')
        .limit(100)

      if (query.nodeId) builder.where('t.node_id', query.nodeId)
      if (query.status) builder.where('t.status', query.status)

      return builder
    },
  )

  // POST /api/v1/tasks/:id/result  (called by agent)
  app.post<{ Params: { id: string } }>(
    '/tasks/:id/result',
    { schema: { tags: ['tasks'], summary: 'Report task result (agent)' } },
    async (request, reply) => {
      const { id } = request.params
      app.log.info(`[tasks] Received result for task ${id}`)
      
      const input = TaskResultSchema.parse(request.body)

      const task = await app.db('tasks').where({ id }).first()
      if (!task) {
        app.log.warn(`[tasks] Task ${id} not found`)
        return reply.status(404).send({ error: 'Not Found', message: 'Task not found' })
      }

      await app.db('tasks').where({ id }).update({
        status: input.status === 'success' ? 'done' : 'failed',
        result: JSON.stringify(input.result ?? {}),
        error_message: input.errorMessage ?? null,
        completed_at: new Date(),
      })

      app.log.info(`[tasks] Task ${id} updated to ${input.status}`)
      return { ok: true }
    },
  )
}

export default taskRoutes
