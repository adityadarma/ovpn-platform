import knex from 'knex'
import config from './knexfile.ts'

const env = (process.env['NODE_ENV'] ?? 'development') as keyof typeof config
const db = knex((config[env] ?? config['development']) as object)

async function migrate() {
  console.log('Running migrations...')
  const [batchNo, log] = await db.migrate.latest()
  if (log.length === 0) {
    console.log('Already up to date')
  } else {
    console.log(`Batch ${batchNo} ran: ${log.join(', ')}`)
  }
  await db.destroy()
}

migrate().catch((err) => {
  console.error(err)
  process.exit(1)
})
