import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('audit_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid())
    table.uuid('user_id').nullable().references('id').inTable('users').onDelete('SET NULL')
    table.string('action', 100).notNullable()
    table.string('resource', 100).notNullable()
    table.string('resource_id', 255).nullable()
    table.string('ip', 45).nullable()
    table.string('user_agent', 512).nullable()
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now())
  })

  await knex.schema.createTable('settings', (table) => {
    table.string('key', 100).primary()
    table.text('value').nullable()
    table.string('description', 500).nullable()
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now())
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('settings')
  await knex.schema.dropTableIfExists('audit_logs')
}
