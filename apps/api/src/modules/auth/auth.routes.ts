import type { FastifyPluginAsync } from 'fastify'
import bcrypt from 'bcryptjs'
import { LoginSchema } from '@ovpn/shared'

const authRoutes: FastifyPluginAsync = async (app) => {
  // POST /api/v1/auth/login
  app.post(
    '/auth/login',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        tags: ['auth'],
        summary: 'Login and get JWT token',
        body: {
          type: 'object',
          required: ['username', 'password'],
          properties: {
            username: { type: 'string' },
            password: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { username, password } = LoginSchema.parse(request.body)

      const user = await app.db('users')
        .where({ username, is_active: true })
        .first()

      if (!user) {
        return reply.status(401).send({ error: 'Unauthorized', message: 'Invalid credentials' })
      }

      const validPassword = await bcrypt.compare(password, user.password_hash)
      if (!validPassword) {
        return reply.status(401).send({ error: 'Unauthorized', message: 'Invalid credentials' })
      }

      // Update last_login
      await app.db('users').where({ id: user.id }).update({ last_login: new Date() })

      const token = app.jwt.sign({
        id: user.id,
        username: user.username,
        role: user.role,
      })

      return {
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
        },
      }
    },
  )

  // GET /api/v1/auth/me
  app.get(
    '/auth/me',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['auth'],
        summary: 'Get current user info',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request) => {
      const payload = request.user as { id: string }
      const user = await app.db('users')
        .select('id', 'username', 'email', 'role', 'is_active', 'last_login', 'created_at')
        .where({ id: payload.id })
        .first()
      return user
    },
  )
}

export default authRoutes
