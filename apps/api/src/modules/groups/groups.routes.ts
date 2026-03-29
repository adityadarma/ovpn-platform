import type { FastifyPluginAsync } from 'fastify'
import crypto from 'node:crypto'
import { nextAvailableIp, getNetmask, parseCidr } from '../../services/ip-pool.service'

interface Group {
  id: string
  name: string
  description: string | null
  vpn_subnet: string | null
  created_at: string
  updated_at: string
  member_count?: number
  network_count?: number
}

const groupRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/v1/groups — list all groups with member & network counts
  app.get(
    '/groups',
    { onRequest: [app.authenticate], schema: { tags: ['groups'], summary: 'List all groups', security: [{ bearerAuth: [] }] } },
    async () => {
      const groups = await app.db('groups as g')
        .select(
          'g.id', 'g.name', 'g.description', 'g.vpn_subnet', 'g.created_at', 'g.updated_at',
          app.db.raw('COUNT(DISTINCT ug.user_id) as member_count'),
          app.db.raw('COUNT(DISTINCT gn.network_id) as network_count'),
        )
        .leftJoin('user_groups as ug', 'g.id', 'ug.group_id')
        .leftJoin('group_networks as gn', 'g.id', 'gn.group_id')
        .groupBy('g.id', 'g.name', 'g.description', 'g.vpn_subnet', 'g.created_at', 'g.updated_at')
        .orderBy('g.name')
      return groups
    },
  )

  // GET /api/v1/groups/:id — get group with its members and networks
  app.get<{ Params: { id: string } }>(
    '/groups/:id',
    { onRequest: [app.authenticate], schema: { tags: ['groups'], summary: 'Get group details', security: [{ bearerAuth: [] }] } },
    async (request, reply) => {
      const group = await app.db('groups').where({ id: request.params.id }).first()
      if (!group) return reply.status(404).send({ error: 'Group not found' })

      const members = await app.db('user_groups as ug')
        .join('users as u', 'ug.user_id', 'u.id')
        .where('ug.group_id', request.params.id)
        .select('u.id', 'u.username', 'u.email', 'u.role', 'u.is_active', 'u.vpn_ip')

      const networks = await app.db('group_networks as gn')
        .join('networks as n', 'gn.network_id', 'n.id')
        .where('gn.group_id', request.params.id)
        .select('n.id', 'n.name', 'n.cidr', 'n.description')

      return { ...group, members, networks }
    },
  )

  // POST /api/v1/groups
  app.post<{ Body: { name: string; description?: string; vpn_subnet?: string } }>(
    '/groups',
    { onRequest: [app.authenticateAdmin], schema: { tags: ['groups'], summary: 'Create a group', security: [{ bearerAuth: [] }] } },
    async (request, reply) => {
      const { name, description, vpn_subnet } = request.body
      if (!name?.trim()) return reply.status(400).send({ error: 'name is required' })

      // Validate subnet if provided
      if (vpn_subnet) {
        try { parseCidr(vpn_subnet) } catch (e: any) {
          return reply.status(400).send({ error: `Invalid vpn_subnet: ${e.message}` })
        }
        // Check not already in use by another group
        const conflict = await app.db('groups')
          .where({ vpn_subnet: vpn_subnet.trim() })
          .first()
        if (conflict) {
          return reply.status(409).send({ error: `Subnet ${vpn_subnet} is already assigned to group "${conflict.name}"` })
        }
      }

      const id = crypto.randomUUID()
      await app.db('groups').insert({
        id,
        name: name.trim(),
        description: description?.trim() ?? null,
        vpn_subnet: vpn_subnet?.trim() ?? null,
      })
      const created = await app.db('groups').where({ id }).first()
      return reply.status(201).send(created)
    },
  )

  // PATCH /api/v1/groups/:id
  app.patch<{ Params: { id: string }; Body: { name?: string; description?: string; vpn_subnet?: string | null } }>(
    '/groups/:id',
    { onRequest: [app.authenticateAdmin], schema: { tags: ['groups'], summary: 'Update a group', security: [{ bearerAuth: [] }] } },
    async (request, reply) => {
      const { name, description, vpn_subnet } = request.body

      const group = await app.db('groups').where({ id: request.params.id }).first()
      if (!group) return reply.status(404).send({ error: 'Group not found' })

      // Validate new subnet
      if (vpn_subnet) {
        try { parseCidr(vpn_subnet) } catch (e: any) {
          return reply.status(400).send({ error: `Invalid vpn_subnet: ${e.message}` })
        }
        const conflict = await app.db('groups')
          .where({ vpn_subnet: vpn_subnet.trim() })
          .whereNot({ id: request.params.id })
          .first()
        if (conflict) {
          return reply.status(409).send({ error: `Subnet ${vpn_subnet} is already assigned to group "${conflict.name}"` })
        }
      }

      await app.db('groups')
        .where({ id: request.params.id })
        .update({
          ...(name ? { name: name.trim() } : {}),
          ...(description !== undefined ? { description: description?.trim() ?? null } : {}),
          ...(vpn_subnet !== undefined ? { vpn_subnet: vpn_subnet?.trim() ?? null } : {}),
          updated_at: new Date(),
        })
      return app.db('groups').where({ id: request.params.id }).first()
    },
  )

  // DELETE /api/v1/groups/:id
  app.delete<{ Params: { id: string } }>(
    '/groups/:id',
    { onRequest: [app.authenticateAdmin], schema: { tags: ['groups'], summary: 'Delete a group', security: [{ bearerAuth: [] }] } },
    async (request, reply) => {
      const deleted = await app.db('groups').where({ id: request.params.id }).delete()
      if (!deleted) return reply.status(404).send({ error: 'Group not found' })
      return reply.status(204).send()
    },
  )

  // POST /api/v1/groups/:id/members — add user to group
  // If the group has a vpn_subnet and user has no vpn_ip yet, auto-assign one
  app.post<{ Params: { id: string }; Body: { user_id: string } }>(
    '/groups/:id/members',
    { onRequest: [app.authenticateAdmin], schema: { tags: ['groups'], summary: 'Add user to group', security: [{ bearerAuth: [] }] } },
    async (request, reply) => {
      const { user_id } = request.body
      if (!user_id) return reply.status(400).send({ error: 'user_id required' })

      const group = await app.db('groups').where({ id: request.params.id }).first()
      if (!group) return reply.status(404).send({ error: 'Group not found' })

      await app.db('user_groups')
        .insert({ group_id: request.params.id, user_id })
        .onConflict(['group_id', 'user_id'])
        .ignore()

      let assignedIp: string | null = null

      // Auto-assign VPN IP if: group has subnet AND user has no vpn_ip yet
      if (group.vpn_subnet) {
        const user = await app.db('users').where({ id: user_id }).first()
        if (user && !user.vpn_ip) {
          assignedIp = await assignVpnIp(app, user_id, request.params.id, group.vpn_subnet)
        }
      }

      return reply.status(201).send({ ok: true, assigned_vpn_ip: assignedIp })
    },
  )

  // DELETE /api/v1/groups/:id/members/:userId — remove user from group
  app.delete<{ Params: { id: string; userId: string } }>(
    '/groups/:id/members/:userId',
    { onRequest: [app.authenticateAdmin], schema: { tags: ['groups'], summary: 'Remove user from group', security: [{ bearerAuth: [] }] } },
    async (request, reply) => {
      await app.db('user_groups').where({ group_id: request.params.id, user_id: request.params.userId }).delete()
      return reply.status(204).send()
    },
  )

  // POST /api/v1/groups/:id/networks — assign network to group
  app.post<{ Params: { id: string }; Body: { network_id: string } }>(
    '/groups/:id/networks',
    { onRequest: [app.authenticateAdmin], schema: { tags: ['groups'], summary: 'Assign network to group', security: [{ bearerAuth: [] }] } },
    async (request, reply) => {
      const { network_id } = request.body
      if (!network_id) return reply.status(400).send({ error: 'network_id required' })
      await app.db('group_networks').insert({ group_id: request.params.id, network_id }).onConflict(['group_id', 'network_id']).ignore()
      return reply.status(201).send({ ok: true })
    },
  )

  // DELETE /api/v1/groups/:id/networks/:networkId
  app.delete<{ Params: { id: string; networkId: string } }>(
    '/groups/:id/networks/:networkId',
    { onRequest: [app.authenticateAdmin], schema: { tags: ['groups'], summary: 'Remove network from group', security: [{ bearerAuth: [] }] } },
    async (request, reply) => {
      await app.db('group_networks').where({ group_id: request.params.id, network_id: request.params.networkId }).delete()
      return reply.status(204).send()
    },
  )

  // POST /api/v1/groups/:id/assign-ips — bulk assign IPs to all members without an IP
  app.post<{ Params: { id: string } }>(
    '/groups/:id/assign-ips',
    { onRequest: [app.authenticateAdmin], schema: { tags: ['groups'], summary: 'Bulk assign VPN IPs to all group members', security: [{ bearerAuth: [] }] } },
    async (request, reply) => {
      const group = await app.db('groups').where({ id: request.params.id }).first()
      if (!group) return reply.status(404).send({ error: 'Group not found' })
      if (!group.vpn_subnet) return reply.status(400).send({ error: 'Group has no vpn_subnet configured' })

      const members = await app.db('user_groups as ug')
        .join('users as u', 'ug.user_id', 'u.id')
        .where('ug.group_id', request.params.id)
        .whereNull('u.vpn_ip')
        .select('u.id')

      const assigned: Array<{ user_id: string; vpn_ip: string }> = []
      for (const member of members) {
        const ip = await assignVpnIp(app, member.id, request.params.id, group.vpn_subnet)
        if (ip) assigned.push({ user_id: member.id, vpn_ip: ip })
      }

      return reply.send({ assigned, count: assigned.length })
    },
  )
}

/**
 * Auto-assign next available IP from group's subnet to a user.
 * Saves vpn_ip + vpn_group_id to users table.
 * Returns the assigned IP, or null if subnet is full.
 */
async function assignVpnIp(
  app: any,
  userId: string,
  groupId: string,
  subnet: string,
): Promise<string | null> {
  // Get all IPs already used in this subnet
  const used = await app.db('users')
    .whereNotNull('vpn_ip')
    .pluck('vpn_ip') as string[]

  const ip = nextAvailableIp(subnet, used)
  if (!ip) {
    app.log.warn(`[ip-pool] Subnet ${subnet} is full, cannot assign IP to user ${userId}`)
    return null
  }

  await app.db('users')
    .where({ id: userId })
    .update({ vpn_ip: ip, vpn_group_id: groupId })

  app.log.info(`[ip-pool] Assigned ${ip} (from ${subnet}) to user ${userId}`)
  return ip
}

export { assignVpnIp }
export default groupRoutes
export type { Group }
