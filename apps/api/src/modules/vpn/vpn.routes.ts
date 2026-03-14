import type { FastifyPluginAsync } from 'fastify'
import bcrypt from 'bcryptjs'

/**
 * VPN Auth API — called by openvpn-client agent living on the VPN server.
 * All endpoints are protected by X-VPN-Token header (vpn_token from env).
 *
 * Flow:
 *   1. openvpn-login  → POST /vpn/auth       (username-as-common-name, auth-user-pass-verify)
 *   2. openvpn-connect→ POST /vpn/connect     (client-connect script)
 *   3. openvpn-disconnect → POST /vpn/disconnect (client-disconnect script)
 */

const vpnRoutes: FastifyPluginAsync = async (app) => {
  // Middleware: validate X-VPN-Token header for all /vpn/* routes
  app.addHook('preHandler', async (request, reply) => {
    const token = request.headers['x-vpn-token'] as string | undefined
    const expected = process.env['VPN_TOKEN']
    if (!expected) {
      app.log.warn('[vpn] VPN_TOKEN env not set — rejecting all VPN auth requests')
      return reply.status(503).send({ error: 'VPN_TOKEN not configured on server' })
    }
    if (!token || token !== expected) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Invalid X-VPN-Token' })
    }
  })

  /**
   * POST /api/v1/vpn/auth
   * Called by: openvpn-login script (auth-user-pass-verify hook)
   * Body: { username, password, node_id }
   * Returns: 200 OK if credentials valid + user is active, else 401
   */
  app.post<{
    Body: { username: string; password: string; node_id?: string }
  }>(
    '/vpn/auth',
    { schema: { tags: ['vpn'], summary: 'Authenticate VPN user credentials' } },
    async (request, reply) => {
      const { username, password, node_id } = request.body

      if (!username || !password) {
        return reply.status(400).send({ error: 'username and password required' })
      }

      const user = await app.db('users').where({ username }).first()

      if (!user) {
        app.log.warn(`[vpn/auth] Unknown user: ${username}`)
        return reply.status(401).send({ error: 'Invalid credentials' })
      }

      if (!user.is_active) {
        app.log.warn(`[vpn/auth] Inactive user: ${username}`)
        return reply.status(403).send({ error: 'Account disabled' })
      }

      // Check validity window (valid_from / valid_to)
      const now = new Date()
      if (user.valid_from && new Date(user.valid_from) > now) {
        return reply.status(403).send({ error: 'Account not yet active' })
      }
      if (user.valid_to && new Date(user.valid_to) < now) {
        return reply.status(403).send({ error: 'Account expired' })
      }

      const passwordMatch = await bcrypt.compare(password, user.password_hash)
      if (!passwordMatch) {
        app.log.warn(`[vpn/auth] Bad password for user: ${username}`)
        return reply.status(401).send({ error: 'Invalid credentials' })
      }

      // Log audit
      await app.db('audit_logs').insert({
        user_id: user.id,
        action: 'vpn_auth_success',
        details: JSON.stringify({ node_id: node_id ?? null }),
        ip_address: request.ip,
        created_at: new Date(),
      }).catch(() => { /* non-fatal */ })

      return reply.status(200).send({
        ok: true,
        user_id: user.id,
        username: user.username,
        role: user.role,
        static_vpn_ip: user.static_vpn_ip ?? null,
      })
    },
  )

  /**
   * POST /api/v1/vpn/connect
   * Called by: openvpn-connect script (client-connect hook)
   * Body: { username, vpn_ip, node_id, common_name }
   * Opens a new session row in vpn_sessions.
   */
  app.post<{
    Body: { username: string; vpn_ip: string; node_id: string; common_name?: string; real_ip?: string }
  }>(
    '/vpn/connect',
    { schema: { tags: ['vpn'], summary: 'Record VPN client connect event' } },
    async (request, reply) => {
      const { username, vpn_ip, node_id, real_ip } = request.body

      if (!username || !vpn_ip || !node_id) {
        return reply.status(400).send({ error: 'username, vpn_ip and node_id required' })
      }

      const user = await app.db('users').where({ username }).first()
      if (!user) return reply.status(404).send({ error: 'User not found' })

      const node = await app.db('vpn_nodes').where({ id: node_id }).first()
      if (!node) return reply.status(404).send({ error: 'Node not found' })

      // Close any previously open session for this user (defensive)
      await app.db('vpn_sessions')
        .where({ user_id: user.id })
        .whereNull('disconnected_at')
        .update({ disconnected_at: new Date() })

      const [sessionId] = await app.db('vpn_sessions').insert({
        user_id: user.id,
        node_id: node.id,
        vpn_ip,
        real_ip: real_ip ?? request.ip,
        bytes_sent: 0,
        bytes_received: 0,
        connected_at: new Date(),
      })

      app.log.info(`[vpn/connect] ${username} connected — session ${sessionId}, IP ${vpn_ip}`)

      // Get user's policy networks for route push (response to agent)
      const networks = await app.db('policies as p')
        .join('users as u', 'p.user_id', 'u.id')
        .where('p.user_id', user.id)
        .where('p.action', 'allow')
        .select('p.network_cidr')

      return reply.status(201).send({
        session_id: sessionId,
        push_routes: networks.map((n: { network_cidr: string }) => n.network_cidr),
        static_ip: user.static_vpn_ip ?? null,
      })
    },
  )

  /**
   * POST /api/v1/vpn/disconnect
   * Called by: openvpn-disconnect script (client-disconnect hook)
   * Body: { username, node_id, bytes_sent, bytes_received }
   * Closes the open session and records traffic stats.
   */
  app.post<{
    Body: { username: string; node_id: string; bytes_sent?: number; bytes_received?: number }
  }>(
    '/vpn/disconnect',
    { schema: { tags: ['vpn'], summary: 'Record VPN client disconnect event' } },
    async (request, reply) => {
      const { username, node_id, bytes_sent = 0, bytes_received = 0 } = request.body

      if (!username || !node_id) {
        return reply.status(400).send({ error: 'username and node_id required' })
      }

      const user = await app.db('users').where({ username }).first()
      if (!user) return reply.status(404).send({ error: 'User not found' })

      const updated = await app.db('vpn_sessions')
        .where({ user_id: user.id, node_id })
        .whereNull('disconnected_at')
        .update({
          disconnected_at: new Date(),
          bytes_sent,
          bytes_received,
        })

      app.log.info(`[vpn/disconnect] ${username} disconnected — ${updated} session(s) closed`)

      return reply.status(200).send({ ok: true, sessions_closed: updated })
    },
  )
}

export default vpnRoutes
