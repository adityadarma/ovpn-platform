import knex, { type Knex } from 'knex'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

export type DatabaseType = 'postgres' | 'mysql' | 'sqlite'

export interface DbConfig {
  type: DatabaseType
  url?: string
  sqlitePath?: string
}

// Resolve the monorepo root/data directory regardless of CWD
// packages/db/src/client.ts  →  go up 3 levels to reach monorepo root
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MONOREPO_ROOT = path.resolve(__dirname, '../../..') // packages/db/src → root
const DEFAULT_SQLITE_PATH = path.join(MONOREPO_ROOT, 'data', 'ovpn.sqlite')

let _db: Knex | null = null

export function createDb(config: DbConfig): Knex {
  if (_db) return _db

  const type = config.type

  let knexConfig: Knex.Config

  if (type === 'postgres') {
    knexConfig = {
      client: 'pg',
      connection: config.url,
      pool: { min: 2, max: 10 },
    }
  } else if (type === 'mysql') {
    knexConfig = {
      client: 'mysql2',
      connection: config.url,
      pool: { min: 2, max: 10 },
    }
  } else {
    // SQLite: always stored at <monorepo-root>/data/ovpn.sqlite unless overridden
    const sqlitePath = config.sqlitePath ?? DEFAULT_SQLITE_PATH
    fs.mkdirSync(path.dirname(sqlitePath), { recursive: true })
    knexConfig = {
      client: 'better-sqlite3',
      connection: { filename: sqlitePath },
      useNullAsDefault: true,
    }
  }

  _db = knex(knexConfig)
  return _db
}

export function getDb(): Knex {
  if (!_db) {
    throw new Error('Database not initialized. Call createDb() first.')
  }
  return _db
}

export async function closeDb(): Promise<void> {
  if (_db) {
    await _db.destroy()
    _db = null
  }
}
