import type { FastifyPluginAsync } from 'fastify'
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { CreateUserSchema, UpdateUserSchema } from '@vpn/shared'

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

      const passwordHash = await bcrypt.hash(input.password, 10)

      const id = crypto.randomUUID()

      await app.db('users').insert({
        id,
        username: input.username,
        email: input.email ?? null,
        password: passwordHash,
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
        updates['password'] = await bcrypt.hash(input.password, 10)
      }

      await app.db('users').where({ id }).update(updates)
      return app.db('users').select('id', 'username', 'email', 'role', 'is_active', 'updated_at').where({ id }).first()
    },
  )

  // POST /api/v1/users/:id/generate-cert
  app.post<{ Params: { id: string }; Body: { nodeId: string; password?: string; passwordProtected?: boolean; validDays?: number | null } }>(
    '/users/:id/generate-cert',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['users'],
        summary: 'Generate client certificate for user',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['nodeId'],
          properties: {
            nodeId: { type: 'string', format: 'uuid' },
            password: { type: 'string', description: 'Password to encrypt private key (optional)' },
            passwordProtected: { type: 'boolean', description: 'Whether to password-protect the key', default: false },
            validDays: { type: ['number', 'null'], description: 'Certificate validity in days (null = unlimited)', default: null }
          }
        }
      }
    },
    async (request, reply) => {
      const { id } = request.params
      const { nodeId, password, passwordProtected, validDays = null } = request.body

      const authUser = request.user as { id: string; role: string }
      if (authUser.role !== 'admin') {
        return reply.status(403).send({ error: 'Forbidden', message: 'Only admins can generate certificates' })
      }

      const user = await app.db('users').where({ id }).first()
      if (!user) {
        return reply.status(404).send({ error: 'Not Found', message: 'User not found' })
      }

      const node = await app.db('vpn_nodes').where({ id: nodeId, status: 'online' }).first()
      if (!node) {
        return reply.status(400).send({ error: 'Bad Request', message: 'Node not found or offline' })
      }

      // If user has existing certificate, add to revocation list
      if (user.client_cert) {
        try {
          // Verify node exists before inserting
          const nodeExists = await app.db('vpn_nodes').where({ id: nodeId }).first()
          if (nodeExists) {
            await app.db('cert_revocations').insert({
              id: crypto.randomUUID(),
              user_id: id,
              node_id: nodeId,
              revoked_cert: user.client_cert,
              reason: 'Certificate regenerated',
              revoked_by: authUser.id,
              revoked_at: new Date()
            })
          } else {
            console.warn(`[revoke-cert] Node ${nodeId} not found, skipping revocation record`)
          }
        } catch (err: any) {
          console.error('Failed to add to revocation list:', err.message)
          // Don't fail the request if revocation logging fails
        }
      }

      // Create task for agent to generate certificate
      const taskId = crypto.randomUUID()
      await app.db('tasks').insert({
        id: taskId,
        node_id: nodeId,
        action: 'generate_client_cert',
        payload: JSON.stringify({
          username: user.username,
          password: passwordProtected ? password : undefined,
          validDays: validDays
        }),
        status: 'pending',
        created_at: new Date(),
      })

      // Wait for task completion (with timeout)
      const maxWait = 30000 // 30 seconds
      const startTime = Date.now()
      
      while (Date.now() - startTime < maxWait) {
        const task = await app.db('tasks').where({ id: taskId }).first()
        
        if (task.status === 'done') {
          const result = JSON.parse(task.result || '{}')
          
          // Save certificate to user record
          await app.db('users').where({ id }).update({
            client_cert: result.clientCert,
            client_key: result.clientKey,
            cert_password_protected: result.passwordProtected,
            cert_generated_at: new Date(),
            cert_expires_at: new Date(result.expiresAt),
            cert_last_renewed_at: new Date(),
            cert_renewal_count: app.db.raw('cert_renewal_count + 1')
          })

          return reply.send({
            message: 'Certificate generated successfully',
            expiresAt: result.expiresAt,
            passwordProtected: result.passwordProtected
          })
        }
        
        if (task.status === 'failed') {
          return reply.status(500).send({
            error: 'Internal Server Error',
            message: `Failed to generate certificate: ${task.error_message || 'Unknown error'}`
          })
        }
        
        // Wait 500ms before checking again
        await new Promise(resolve => setTimeout(resolve, 500))
      }

      return reply.status(408).send({
        error: 'Request Timeout',
        message: 'Certificate generation timed out'
      })
    }
  )

  // POST /api/v1/users/bulk-generate-cert
  app.post<{ Body: { userIds: string[]; nodeId: string; password?: string; passwordProtected?: boolean; validDays?: number } }>(
    '/users/bulk-generate-cert',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['users'],
        summary: 'Bulk generate certificates for multiple users',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['userIds', 'nodeId'],
          properties: {
            userIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
            nodeId: { type: 'string', format: 'uuid' },
            password: { type: 'string' },
            passwordProtected: { type: 'boolean', default: false },
            validDays: { type: 'number', default: 3650 }
          }
        }
      }
    },
    async (request, reply) => {
      const { userIds, nodeId, password, passwordProtected, validDays = 3650 } = request.body

      const authUser = request.user as { id: string; role: string }
      if (authUser.role !== 'admin') {
        return reply.status(403).send({ error: 'Forbidden', message: 'Only admins can generate certificates' })
      }

      const node = await app.db('vpn_nodes').where({ id: nodeId, status: 'online' }).first()
      if (!node) {
        return reply.status(400).send({ error: 'Bad Request', message: 'Node not found or offline' })
      }

      const results = {
        success: [] as string[],
        failed: [] as { userId: string; error: string }[]
      }

      // Process each user
      for (const userId of userIds) {
        try {
          const user = await app.db('users').where({ id: userId }).first()
          if (!user) {
            results.failed.push({ userId, error: 'User not found' })
            continue
          }

          // Revoke existing certificate
          if (user.client_cert) {
            try {
              // Verify node exists before inserting
              const nodeExists = await app.db('vpn_nodes').where({ id: nodeId }).first()
              if (nodeExists) {
                await app.db('cert_revocations').insert({
                  id: crypto.randomUUID(),
                  user_id: userId,
                  node_id: nodeId,
                  revoked_cert: user.client_cert,
                  reason: 'Bulk certificate generation',
                  revoked_by: authUser.id,
                  revoked_at: new Date()
                })
              }
            } catch (err: any) {
              console.warn(`[bulk-gen] Failed to add revocation for user ${userId}:`, err.message)
              // Continue with certificate generation even if revocation logging fails
            }
          }

          // Create task
          const taskId = crypto.randomUUID()
          await app.db('tasks').insert({
            id: taskId,
            node_id: nodeId,
            action: 'generate_client_cert',
            payload: JSON.stringify({
              username: user.username,
              password: passwordProtected ? password : undefined,
              validDays: validDays
            }),
            status: 'pending',
            created_at: new Date(),
          })

          // Wait for completion (shorter timeout for bulk)
          const maxWait = 15000
          const startTime = Date.now()
          let success = false

          while (Date.now() - startTime < maxWait) {
            const task = await app.db('tasks').where({ id: taskId }).first()
            
            if (task.status === 'success') {
              const result = JSON.parse(task.result || '{}')
              await app.db('users').where({ id: userId }).update({
                client_cert: result.clientCert,
                client_key: result.clientKey,
                cert_password_protected: result.passwordProtected,
                cert_generated_at: new Date(),
                cert_expires_at: new Date(result.expiresAt),
                cert_last_renewed_at: new Date(),
                cert_renewal_count: app.db.raw('cert_renewal_count + 1')
              })
              success = true
              break
            }
            
            if (task.status === 'failed') {
              results.failed.push({ userId, error: task.error_message || 'Unknown error' })
              break
            }
            
            await new Promise(resolve => setTimeout(resolve, 500))
          }

          if (success) {
            results.success.push(userId)
          } else if (!results.failed.find(f => f.userId === userId)) {
            results.failed.push({ userId, error: 'Timeout' })
          }
        } catch (error: any) {
          results.failed.push({ userId, error: error.message })
        }
      }

      return reply.send({
        message: `Bulk generation completed: ${results.success.length} succeeded, ${results.failed.length} failed`,
        results
      })
    }
  )

  // GET /api/v1/users/expiring-certs
  app.get<{ Querystring: { days?: number } }>(
    '/users/expiring-certs',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['users'],
        summary: 'Get users with expiring certificates',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            days: { type: 'number', description: 'Days until expiration (default: 30)', default: 30 }
          }
        }
      }
    },
    async (request, reply) => {
      const { days = 30 } = request.query
      const expiryDate = new Date()
      expiryDate.setDate(expiryDate.getDate() + days)

      const users = await app.db('users')
        .whereNotNull('cert_expires_at')
        .where('cert_expires_at', '<=', expiryDate)
        .where('cert_expires_at', '>', new Date())
        .select('id', 'username', 'email', 'cert_expires_at', 'cert_auto_renew')

      return reply.send(users)
    }
  )

  // GET /api/v1/users/:id/vpn
  app.get<{ Params: { id: string }; Querystring: { nodeId?: string } }>(
    '/users/:id/vpn',
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
        return reply.status(400).send({ error: 'Bad Request', message: 'Node has not uploaded certificates yet (CA cert and TLS key required)' })
      }

      // Check if user has client certificate
      if (!user.client_cert || !user.client_key) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'User does not have a client certificate. Generate one first via POST /users/:id/generate-cert'
        })
      }

      // Track download history
      try {
        await app.db('cert_download_history').insert({
          id: crypto.randomUUID(),
          user_id: id,
          node_id: node.id,
          ip_address: request.ip,
          user_agent: request.headers['user-agent'] || null,
          downloaded_at: new Date()
        })
      } catch (err) {
        // Log but don't fail the download
        console.error('Failed to track download history:', err)
      }

      // Get node configuration settings
      const protocol = node.protocol || 'udp'
      const cipher = node.cipher || 'AES-128-GCM' // Changed default to match server
      const authDigest = node.auth_digest || 'SHA256'
      
      // Build config with node-specific settings
      const protoClient = protocol === 'tcp' ? 'tcp-client' : protocol
      
      // Determine TLS cipher based on server cipher
      let tlsCipher = 'TLS-ECDHE-ECDSA-WITH-AES-128-GCM-SHA256'
      if (cipher.includes('256')) {
        tlsCipher = 'TLS-ECDHE-ECDSA-WITH-AES-256-GCM-SHA384'
      }
      
      let config = `client
proto ${protoClient}
${protocol === 'udp' ? 'explicit-exit-notify' : ''}
remote ${node.ip_address} ${node.port}
dev tun
resolv-retry infinite
nobind
persist-key
persist-tun
remote-cert-tls server
auth ${authDigest}
auth-nocache
cipher ${cipher}
tls-client
tls-version-min 1.2
tls-cipher ${tlsCipher}
ignore-unknown-option block-outside-dns
setenv opt block-outside-dns
verb 3

<ca>
${node.ca_cert.trim()}
</ca>

<cert>
${user.client_cert.trim()}
</cert>

<key>
${user.client_key.trim()}
</key>

<tls-crypt>
${node.ta_key.trim()}
</tls-crypt>
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
