import type { FastifyPluginAsync } from 'fastify'
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { CreateUserSchema, UpdateUserSchema } from '@ovpn/shared'

const userRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/v1/users
  app.get(
    '/users',
    { onRequest: [app.authenticate], schema: { tags: ['users'], summary: 'List all VPN users', security: [{ bearerAuth: [] }] } },
    async () => {
      return app.db('users').select('id', 'username', 'email', 'role', 'is_active', 'last_login', 'created_at', 'updated_at')
    },
  )

  // GET /api/v1/users/:id
  app.get<{ Params: { id: string } }>(
    '/users/:id',
    { onRequest: [app.authenticate], schema: { tags: ['users'], summary: 'Get user by ID', security: [{ bearerAuth: [] }] } },
    async (request, reply) => {
      const user = await app.db('users')
        .select('id', 'username', 'email', 'role', 'is_active', 'last_login', 'created_at', 'updated_at')
        .where({ id: request.params.id })
        .first()
      if (!user) return reply.status(404).send({ error: 'Not Found', message: 'User not found' })
      return user
    },
  )

  // POST /api/v1/users
  app.post(
    '/users',
    { onRequest: [app.authenticateAdmin], schema: { tags: ['users'], summary: 'Create a new VPN user', security: [{ bearerAuth: [] }] } },
    async (request, reply) => {
      const input = CreateUserSchema.parse(request.body)

      const existing = await app.db('users').where({ username: input.username }).first()
      if (existing) {
        return reply.status(409).send({ error: 'Conflict', message: 'Username already exists' })
      }

      const passwordHash = await bcrypt.hash(input.password, 12)

      const id = crypto.randomUUID()

      await app.db('users').insert({
        id,
        username: input.username,
        email: input.email ?? null,
        password_hash: passwordHash,
        role: input.role ?? 'user',
        is_active: true,
      })

      const user = await app.db('users')
        .select('id', 'username', 'email', 'role', 'is_active', 'created_at')
        .where({ id })
        .first()

      return reply.status(201).send(user)
    },
  )

  // PATCH /api/v1/users/:id
  app.patch<{ Params: { id: string } }>(
    '/users/:id',
    { onRequest: [app.authenticateAdmin], schema: { tags: ['users'], summary: 'Update a VPN user', security: [{ bearerAuth: [] }] } },
    async (request, reply) => {
      const input = UpdateUserSchema.parse(request.body)
      const { id } = request.params

      const user = await app.db('users').where({ id }).first()
      if (!user) return reply.status(404).send({ error: 'Not Found', message: 'User not found' })

      const updates: Record<string, unknown> = {
        ...(input.username && { username: input.username }),
        ...(input.email !== undefined && { email: input.email }),
        ...(input.role && { role: input.role }),
        ...(input.isActive !== undefined && { is_active: input.isActive }),
        updated_at: new Date(),
      }

      if (input.password) {
        updates['password_hash'] = await bcrypt.hash(input.password, 12)
      }

      await app.db('users').where({ id }).update(updates)
      return app.db('users').select('id', 'username', 'email', 'role', 'is_active', 'updated_at').where({ id }).first()
    },
  )

  // GET /api/v1/users/:id/ovpn
  app.get<{ Params: { id: string }; Querystring: { nodeId?: string } }>(
    '/users/:id/ovpn',
    { onRequest: [app.authenticate], schema: { tags: ['users'], summary: 'Download .ovpn config', security: [{ bearerAuth: [] }] } },
    async (request, reply) => {
      const { id } = request.params
      const { nodeId } = request.query

      const user = await app.db('users').where({ id }).first()
      if (!user) return reply.status(404).send({ error: 'Not Found', message: 'User not found' })

      const authUser = request.user as { id: string; role: string }
      if (authUser.role !== 'admin' && authUser.id !== id) {
        return reply.status(403).send({ error: 'Forbidden' })
      }

      const nodeQuery = app.db('vpn_nodes').where('status', 'online')
      if (nodeId) nodeQuery.where({ id: nodeId })
      
      const node = await nodeQuery.first()

      if (!node) {
        return reply.status(400).send({ error: 'Bad Request', message: 'No online VPN nodes available' })
      }

      if (!node.ca_cert || !node.ta_key) {
        return reply.status(400).send({ error: 'Bad Request', message: 'Node has not uploaded certificates yet' })
      }

      const config = `client
dev tun
proto udp
remote ${node.ip_address} ${node.port}
resolv-retry infinite
nobind
persist-key
persist-tun
remote-cert-tls server
cipher AES-256-GCM
auth-user-pass
verify-client-cert none

<ca>
${node.ca_cert.trim()}
</ca>

<tls-auth>
${node.ta_key.trim()}
</tls-auth>
key-direction 1
`
      reply.header('Content-Disposition', `attachment; filename="${user.username}-${node.hostname}.ovpn"`)
      reply.type('application/x-openvpn-profile')
      return reply.send(config)
    },
  )

  // DELETE /api/v1/users/:id
  app.delete<{ Params: { id: string } }>(
    '/users/:id',
    { onRequest: [app.authenticateAdmin], schema: { tags: ['users'], summary: 'Delete a VPN user', security: [{ bearerAuth: [] }] } },
    async (request, reply) => {
      const { id } = request.params
      const deleted = await app.db('users').where({ id }).delete()
      if (!deleted) return reply.status(404).send({ error: 'Not Found', message: 'User not found' })
      return reply.status(204).send()
    },
  )
}

export default userRoutes
