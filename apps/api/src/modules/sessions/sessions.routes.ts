import type { FastifyPluginAsync } from 'fastify'

const sessionRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/v1/sessions  — active sessions
  app.get(
    '/sessions',
    { onRequest: [app.authenticate], schema: { tags: ['sessions'], summary: 'List active VPN sessions', security: [{ bearerAuth: [] }] } },
    async () => {
      return app.db('vpn_sessions as s')
        .join('users as u', 's.user_id', 'u.id')
        .join('vpn_nodes as n', 's.node_id', 'n.id')
        .whereNull('s.disconnected_at')
        .select(
          's.id',
          'u.username',
          'n.hostname as node_hostname',
          's.vpn_ip',
          's.bytes_sent',
          's.bytes_received',
          's.connected_at',
        )
    },
  )

  // GET /api/v1/sessions/history
  app.get(
    '/sessions/history',
    { onRequest: [app.authenticate], schema: { tags: ['sessions'], summary: 'Session history', security: [{ bearerAuth: [] }] } },
    async (request) => {
      const query = request.query as { page?: string; limit?: string }
      const page = parseInt(query.page ?? '1')
      const limit = Math.min(parseInt(query.limit ?? '20'), 100)
      const offset = (page - 1) * limit

      return app.db('vpn_sessions as s')
        .join('users as u', 's.user_id', 'u.id')
        .join('vpn_nodes as n', 's.node_id', 'n.id')
        .select(
          's.id',
          'u.username',
          'n.hostname as node_hostname',
          's.vpn_ip',
          's.bytes_sent',
          's.bytes_received',
          's.connected_at',
          's.disconnected_at',
        )
        .orderBy('s.connected_at', 'desc')
        .limit(limit)
        .offset(offset)
    },
  )
}

export default sessionRoutes
