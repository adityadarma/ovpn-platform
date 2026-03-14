import knex from 'knex'
import config from './knexfile.ts'

const env = (process.env['NODE_ENV'] ?? 'development') as keyof typeof config
const db = knex((config[env] ?? config['development']) as object)


async function rollback() {
  console.log('Rolling back last batch...')
  const [batchNo, log] = await db.migrate.rollback()
  if (log.length === 0) {
    console.log('Already at the base migration')
  } else {
    console.log(`Batch ${batchNo} rolled back: ${log.join(', ')}`)
  }
  await db.destroy()
}

rollback().catch((err) => {
  console.error(err)
  process.exit(1)
})
