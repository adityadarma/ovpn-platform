import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('tasks', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid())
    table.uuid('node_id').notNullable().references('id').inTable('vpn_nodes').onDelete('CASCADE')
    table.string('action', 100).notNullable()
    table.json('payload').notNullable()
    table.enu('status', ['pending', 'running', 'done', 'failed']).notNullable().defaultTo('pending')
    table.json('result').nullable()
    table.text('error_message').nullable()
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now())
    table.timestamp('completed_at').nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('tasks')
}
