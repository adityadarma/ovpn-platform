import knex from 'knex'
import config from './knexfile.ts'

const env = (process.env['NODE_ENV'] ?? 'development') as keyof typeof config
const db = knex((config[env] ?? config['development']) as object)


async function seed() {
  console.log('Running seeds...')
  await db.seed.run()
  console.log('Seeds complete')
  await db.destroy()
}

seed().catch((err) => {
  console.error(err)
  process.exit(1)
})
