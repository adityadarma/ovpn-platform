import fp from 'fastify-plugin'
import type { Knex } from 'knex'

declare module 'fastify' {
  interface FastifyInstance {
    db: Knex
  }
}

interface DbPluginOptions {
  db: Knex
}

export default fp(async (app, options: DbPluginOptions) => {
  app.decorate('db', options.db)

  app.addHook('onClose', async () => {
    await options.db.destroy()
  })
})
