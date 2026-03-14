import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('vpn_sessions', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid())
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.uuid('node_id').notNullable().references('id').inTable('vpn_nodes').onDelete('CASCADE')
    table.string('vpn_ip', 45).notNullable()
    table.bigInteger('bytes_sent').notNullable().defaultTo(0)
    table.bigInteger('bytes_received').notNullable().defaultTo(0)
    table.timestamp('connected_at').notNullable().defaultTo(knex.fn.now())
    table.timestamp('disconnected_at').nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('vpn_sessions')
}
