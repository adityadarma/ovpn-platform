import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('vpn_nodes', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid())
    table.string('hostname', 255).notNullable()
    table.string('ip_address', 45).notNullable()
    table.integer('port').notNullable().defaultTo(1194)
    table.string('region', 100).nullable()
    table.string('token', 255).notNullable().unique()
    table.enu('status', ['online', 'offline', 'unknown']).notNullable().defaultTo('unknown')
    table.string('version', 50).nullable()
    table.timestamp('last_seen').nullable()
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now())
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('vpn_nodes')
}
