import type { FastifyPluginAsync } from 'fastify'
import crypto from 'node:crypto'

const sessionRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/v1/sessions  — active sessions with enhanced details
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
          's.user_id',
          'u.username',
          'u.email',
          'n.id as node_id',
          'n.hostname as node_hostname',
          'n.region as node_region',
          's.vpn_ip',
          's.real_ip',
          's.client_version',
          's.device_name',
          's.geo_country',
          's.geo_city',
          's.bytes_sent',
          's.bytes_received',
          's.connected_at',
          's.last_activity_at',
          app.db.raw("CAST((julianday('now') - julianday(s.connected_at)) * 86400 AS INTEGER) as duration_seconds"),
        )
        .orderBy('s.connected_at', 'desc')
    },
  )

  // GET /api/v1/sessions/:id  — session details with activity history
  app.get<{ Params: { id: string } }>(
    '/sessions/:id',
    { onRequest: [app.authenticate], schema: { tags: ['sessions'], summary: 'Get session details', security: [{ bearerAuth: [] }] } },
    async (request, reply) => {
      const { id } = request.params

      const session = await app.db('vpn_sessions as s')
        .join('users as u', 's.user_id', 'u.id')
        .join('vpn_nodes as n', 's.node_id', 'n.id')
        .where('s.id', id)
        .select(
          's.*',
          'u.username',
          'u.email',
          'n.hostname as node_hostname',
          'n.region as node_region',
        )
        .first()

      if (!session) {
        return reply.status(404).send({ error: 'Session not found' })
      }

      // Get activity history
      const activities = await app.db('session_activities')
        .where({ session_id: id })
        .orderBy('recorded_at', 'desc')
        .limit(100)

      return {
        ...session,
        activities,
      }
    },
  )

  // GET /api/v1/sessions/history
  app.get(
    '/sessions/history',
    { onRequest: [app.authenticate], schema: { tags: ['sessions'], summary: 'Session history', security: [{ bearerAuth: [] }] } },
    async (request) => {
      const query = request.query as { page?: string; limit?: string; user_id?: string; node_id?: string }
      const page = parseInt(query.page ?? '1')
      const limit = Math.min(parseInt(query.limit ?? '20'), 100)
      const offset = (page - 1) * limit

      let queryBuilder = app.db('vpn_sessions as s')
        .join('users as u', 's.user_id', 'u.id')
        .join('vpn_nodes as n', 's.node_id', 'n.id')

      // Filter by user_id if provided
      if (query.user_id) {
        queryBuilder = queryBuilder.where('s.user_id', query.user_id)
      }

      // Filter by node_id if provided
      if (query.node_id) {
        queryBuilder = queryBuilder.where('s.node_id', query.node_id)
      }

      const sessions = await queryBuilder
        .select(
          's.id',
          'u.username',
          'n.hostname as node_hostname',
          's.vpn_ip',
          's.real_ip',
          's.client_version',
          's.device_name',
          's.bytes_sent',
          's.bytes_received',
          's.connected_at',
          's.disconnected_at',
          's.disconnect_reason',
          's.connection_duration_seconds',
        )
        .orderBy('s.connected_at', 'desc')
        .limit(limit)
        .offset(offset)

      // Get total count
      const countResult = await app.db('vpn_sessions')
        .count('* as count')
        .first()

      const total = Number(countResult?.count || 0)

      return {
        sessions,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      }
    },
  )

  // GET /api/v1/sessions/stats  — session statistics
  app.get(
    '/sessions/stats',
    { onRequest: [app.authenticate], schema: { tags: ['sessions'], summary: 'Session statistics', security: [{ bearerAuth: [] }] } },
    async () => {
      // Active sessions count
      const activeCount = await app.db('vpn_sessions')
        .whereNull('disconnected_at')
        .count('* as count')
        .first()

      // Total sessions today
      const todayCount = await app.db('vpn_sessions')
        .where('connected_at', '>=', app.db.raw("datetime('now', '-1 day')"))
        .count('* as count')
        .first()

      // Total bandwidth today
      const todayBandwidth = await app.db('vpn_sessions')
        .where('connected_at', '>=', app.db.raw("datetime('now', '-1 day')"))
        .sum('bytes_sent as sent')
        .sum('bytes_received as received')
        .first()

      // Average session duration (last 24h)
      const avgDuration = await app.db('vpn_sessions')
        .whereNotNull('disconnected_at')
        .where('connected_at', '>=', app.db.raw("datetime('now', '-1 day')"))
        .avg('connection_duration_seconds as avg')
        .first()

      // Top users by bandwidth (last 7 days)
      const topUsers = await app.db('vpn_sessions as s')
        .join('users as u', 's.user_id', 'u.id')
        .where('s.connected_at', '>=', app.db.raw("datetime('now', '-7 days')"))
        .groupBy('s.user_id', 'u.username')
        .select(
          's.user_id',
          'u.username',
          app.db.raw('SUM(s.bytes_sent + s.bytes_received) as total_bytes'),
          app.db.raw('COUNT(*) as session_count'),
        )
        .orderBy('total_bytes', 'desc')
        .limit(10)

      return {
        active_sessions: activeCount?.count || 0,
        sessions_today: todayCount?.count || 0,
        bandwidth_today: {
          sent: todayBandwidth?.sent || 0,
          received: todayBandwidth?.received || 0,
          total: (todayBandwidth?.sent || 0) + (todayBandwidth?.received || 0),
        },
        avg_duration_seconds: Math.round(avgDuration?.avg || 0),
        top_users: topUsers,
      }
    },
  )

  // POST /api/v1/sessions/:id/kick  — admin kick user
  app.post<{ Params: { id: string } }>(
    '/sessions/:id/kick',
    { 
      onRequest: [app.authenticate],
      schema: { tags: ['sessions'], summary: 'Kick active session (admin only)', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      // Check if user is admin
      const user = request.user as { id: string; username: string; role: string }
      if (user.role !== 'admin') {
        return reply.status(403).send({ error: 'Forbidden', message: 'Admin access required' })
      }

      const { id } = request.params
      const adminUser = user

      const session = await app.db('vpn_sessions')
        .where({ id })
        .whereNull('disconnected_at')
        .first()

      if (!session) {
        return reply.status(404).send({ error: 'Active session not found' })
      }

      const now = new Date()
      const connectedAt = new Date(session.connected_at)
      const durationSeconds = Math.floor((now.getTime() - connectedAt.getTime()) / 1000)

      // Close session in DB
      await app.db('vpn_sessions')
        .where({ id })
        .update({
          disconnected_at: now,
          disconnect_reason: 'admin_kick',
          connection_duration_seconds: durationSeconds,
        })

      // Log audit
      await app.db('audit_logs').insert({
        id: crypto.randomUUID(),
        user_id: adminUser.id,
        username: adminUser.username,
        action: 'session_kick',
        resource_type: 'vpn_session',
        resource_id: id,
        session_id: id,
        ip_address: request.ip,
        metadata: JSON.stringify({
          kicked_user_id: session.user_id,
          node_id: session.node_id,
        }),
        created_at: new Date(),
      })

      // Look up the kicked user's username for the agent payload
      const kickedUser = await app.db('users').where({ id: session.user_id }).first()
      const commonName = kickedUser?.username ?? null

      // Dispatch kick task to the node agent so the VPN tunnel is actually dropped
      if (commonName) {
        try {
          await app.db('tasks').insert({
            id: crypto.randomUUID(),
            node_id: session.node_id,
            action: 'kick_vpn_session',
            payload: JSON.stringify({ common_name: commonName }),
            status: 'pending',
            result: null,
            error_message: null,
            created_at: new Date(),
            completed_at: null,
          })
          app.log.info(`[sessions/kick] Enqueued kick_vpn_session task for ${commonName} on node ${session.node_id}`)
        } catch (taskErr) {
          // Non-fatal — DB record is already closed; agent will reconcile on next status poll
          app.log.error(`[sessions/kick] Failed to enqueue disconnect task: ${(taskErr as Error).message}`)
        }
      } else {
        app.log.warn(`[sessions/kick] Could not resolve username for user_id ${session.user_id} — VPN client may remain connected until it disconnects naturally`)
      }

      return { ok: true, message: 'Session kicked' }
    },
  )
}

export default sessionRoutes
