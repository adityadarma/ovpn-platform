import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('vpn_policies', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid())
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.string('allowed_network', 50).notNullable()
    table.enu('action', ['allow', 'deny']).notNullable().defaultTo('allow')
    table.integer('priority').notNullable().defaultTo(100)
    table.text('description').nullable()
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now())
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('vpn_policies')
}
