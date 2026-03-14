import type { FastifyPluginAsync } from 'fastify'

interface Group {
  id: string
  name: string
  description: string | null
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
          'g.id', 'g.name', 'g.description', 'g.created_at', 'g.updated_at',
          app.db.raw('COUNT(DISTINCT ug.user_id) as member_count'),
          app.db.raw('COUNT(DISTINCT gn.network_id) as network_count'),
        )
        .leftJoin('user_groups as ug', 'g.id', 'ug.group_id')
        .leftJoin('group_networks as gn', 'g.id', 'gn.group_id')
        .groupBy('g.id', 'g.name', 'g.description', 'g.created_at', 'g.updated_at')
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
        .select('u.id', 'u.username', 'u.email', 'u.role', 'u.is_active')

      const networks = await app.db('group_networks as gn')
        .join('networks as n', 'gn.network_id', 'n.id')
        .where('gn.group_id', request.params.id)
        .select('n.id', 'n.name', 'n.cidr', 'n.description')

      return { ...group, members, networks }
    },
  )

  // POST /api/v1/groups
  app.post<{ Body: { name: string; description?: string } }>(
    '/groups',
    { onRequest: [app.authenticateAdmin], schema: { tags: ['groups'], summary: 'Create a group', security: [{ bearerAuth: [] }] } },
    async (request, reply) => {
      const { name, description } = request.body
      if (!name?.trim()) return reply.status(400).send({ error: 'name is required' })

      const [id] = await app.db('groups').insert({
        name: name.trim(),
        description: description?.trim() ?? null,
      })
      const created = await app.db('groups').where({ id }).first()
      return reply.status(201).send(created)
    },
  )

  // PATCH /api/v1/groups/:id
  app.patch<{ Params: { id: string }; Body: { name?: string; description?: string } }>(
    '/groups/:id',
    { onRequest: [app.authenticateAdmin], schema: { tags: ['groups'], summary: 'Update a group', security: [{ bearerAuth: [] }] } },
    async (request, reply) => {
      const { name, description } = request.body
      const updated = await app.db('groups')
        .where({ id: request.params.id })
        .update({
          ...(name ? { name: name.trim() } : {}),
          ...(description !== undefined ? { description: description?.trim() ?? null } : {}),
          updated_at: new Date(),
        })
      if (!updated) return reply.status(404).send({ error: 'Group not found' })
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
  app.post<{ Params: { id: string }; Body: { user_id: string } }>(
    '/groups/:id/members',
    { onRequest: [app.authenticateAdmin], schema: { tags: ['groups'], summary: 'Add user to group', security: [{ bearerAuth: [] }] } },
    async (request, reply) => {
      const { user_id } = request.body
      if (!user_id) return reply.status(400).send({ error: 'user_id required' })
      await app.db('user_groups').insert({ group_id: request.params.id, user_id }).onConflict(['group_id', 'user_id']).ignore()
      return reply.status(201).send({ ok: true })
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
}

export default groupRoutes
export type { Group }
