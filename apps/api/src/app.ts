import Fastify from 'fastify'
import { createDb } from '@ovpn/db'
import type { Env } from './config/env'

import corsPlugin from './plugins/cors'
import jwtPlugin from './plugins/jwt'
import rateLimitPlugin from './plugins/rate-limit'
import swaggerPlugin from './plugins/swagger'
import dbPlugin from './plugins/db'

import healthRoutes from './modules/health/health.routes'
import authRoutes from './modules/auth/auth.routes'
import userRoutes from './modules/users/users.routes'
import nodeRoutes from './modules/nodes/nodes.routes'
import sessionRoutes from './modules/sessions/sessions.routes'
import policyRoutes from './modules/policies/policies.routes'
import taskRoutes from './modules/tasks/tasks.routes'
import settingsRoutes from './modules/settings/settings.routes'
import vpnRoutes from './modules/vpn/vpn.routes'
import groupRoutes from './modules/groups/groups.routes'
import networkRoutes from './modules/networks/networks.routes'

export async function buildApp(env: Env) {
  const db = createDb({
    type: env.DATABASE_TYPE,
    url: env.DATABASE_URL,
    sqlitePath: env.DATABASE_SQLITE_PATH,
  })

  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'development' ? 'info' : 'warn',
    },
  })

  // Plugins
  await app.register(corsPlugin)
  await app.register(rateLimitPlugin)
  await app.register(dbPlugin, { db })
  await app.register(jwtPlugin, { secret: env.JWT_SECRET, expiresIn: env.JWT_EXPIRES_IN })
  await app.register(swaggerPlugin, { nodeEnv: env.NODE_ENV })

  // Routes — all under /api/v1
  await app.register(
    async (v1) => {
      await v1.register(healthRoutes)
      await v1.register(authRoutes)
      await v1.register(userRoutes)
      await v1.register(nodeRoutes)
      await v1.register(sessionRoutes)
      await v1.register(policyRoutes)
      await v1.register(taskRoutes)
      await v1.register(settingsRoutes)
      await v1.register(vpnRoutes)
      await v1.register(groupRoutes)
      await v1.register(networkRoutes)
    },
    { prefix: '/api/v1' },
  )

  return app
}
